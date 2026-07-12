import { ConfidentialClientApplication } from '@azure/msal-node';
import { serverEnv } from '@/lib/env';

/**
 * أرشفة الأصول في SharePoint عبر Microsoft Graph API (client credentials flow).
 * الصلاحية المطلوبة على تسجيل التطبيق: Sites.ReadWrite.All (Application).
 */

let msalApp: ConfidentialClientApplication | null = null;
function getApp() {
  if (!msalApp) {
    msalApp = new ConfidentialClientApplication({
      auth: {
        clientId: serverEnv.azure.clientId,
        clientSecret: serverEnv.azure.clientSecret,
        authority: `https://login.microsoftonline.com/${serverEnv.azure.tenantId}`,
      },
    });
  }
  return msalApp;
}

async function getToken(): Promise<string> {
  const res = await getApp().acquireTokenByClientCredential({
    scopes: ['https://graph.microsoft.com/.default'],
  });
  if (!res?.accessToken) throw new Error('تعذّر الحصول على رمز Graph');
  return res.accessToken;
}

const GRAPH = 'https://graph.microsoft.com/v1.0';

/** ينشئ مجلد الدورة إن لم يوجد ويعيد اسمه (اسم-الدورة_تاريخ-البداية) */
export function courseFolderName(title: string, startDate?: string | null): string {
  const safe = title.replace(/[\\/:*?"<>|]/g, '-').trim().slice(0, 80);
  const date = startDate ? startDate.slice(0, 10) : 'بدون-تاريخ';
  return `${safe}_${date}`;
}

async function ensureFolder(token: string, driveId: string, folder: string): Promise<void> {
  await fetch(`${GRAPH}/drives/${driveId}/root/children`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: folder,
      folder: {},
      '@microsoft.graph.conflictBehavior': 'fail', // لا تُعِد الإنشاء إن وُجد
    }),
  });
  // 409 (موجود مسبقًا) مقبول — نتجاهله
}

/** رفع ملف صغير (≤ 4MB) مباشرة */
async function uploadSmall(
  token: string,
  driveId: string,
  folder: string,
  fileName: string,
  data: Buffer,
): Promise<string> {
  const res = await fetch(
    `${GRAPH}/drives/${driveId}/root:/${encodeURIComponent(folder)}/${encodeURIComponent(fileName)}:/content`,
    {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream' },
      body: new Uint8Array(data),
    },
  );
  if (!res.ok) throw new Error(`رفع فشل: ${res.status}`);
  const json = await res.json();
  return json.webUrl as string;
}

/** رفع ملف كبير (> 4MB) عبر upload session بقطع 10MB */
async function uploadLarge(
  token: string,
  driveId: string,
  folder: string,
  fileName: string,
  data: Buffer,
): Promise<string> {
  const sessionRes = await fetch(
    `${GRAPH}/drives/${driveId}/root:/${encodeURIComponent(folder)}/${encodeURIComponent(fileName)}:/createUploadSession`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ item: { '@microsoft.graph.conflictBehavior': 'replace' } }),
    },
  );
  const { uploadUrl } = await sessionRes.json();
  if (!uploadUrl) throw new Error('تعذّر إنشاء upload session');

  const CHUNK = 10 * 1024 * 1024; // 10MB (مضاعف 320KB)
  const total = data.length;
  let webUrl = '';

  for (let start = 0; start < total; start += CHUNK) {
    const end = Math.min(start + CHUNK, total);
    const chunk = data.subarray(start, end);
    const res = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Length': String(chunk.length),
        'Content-Range': `bytes ${start}-${end - 1}/${total}`,
      },
      body: new Uint8Array(chunk),
    });
    if (res.status === 200 || res.status === 201) {
      webUrl = (await res.json()).webUrl;
    } else if (res.status !== 202) {
      throw new Error(`رفع القطعة فشل: ${res.status}`);
    }
  }
  return webUrl;
}

/**
 * أرشفة ملف واحد مع إعادة المحاولة تلقائيًا (3 مرات).
 * يعيد رابط SharePoint عند النجاح.
 */
export async function archiveToSharePoint(
  courseTitle: string,
  startDate: string | null,
  fileName: string,
  data: Buffer,
): Promise<string> {
  const { driveId } = serverEnv.sharepoint;
  const folder = courseFolderName(courseTitle, startDate);

  let lastErr: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const token = await getToken();
      await ensureFolder(token, driveId, folder);
      return data.length > 4 * 1024 * 1024
        ? await uploadLarge(token, driveId, folder, fileName, data)
        : await uploadSmall(token, driveId, folder, fileName, data);
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, attempt * 1000)); // backoff
    }
  }
  throw lastErr;
}
