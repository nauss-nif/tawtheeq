// إعلان مبسّط لمكتبة page-flip (لا توفر أنواعًا رسمية كاملة)
declare module 'page-flip' {
  export type PageFlipEvent = { data: number; object: PageFlip };

  export class PageFlip {
    constructor(element: HTMLElement, settings: Record<string, unknown>);
    loadFromHTML(items: NodeListOf<HTMLElement> | HTMLElement[]): void;
    updateFromHtml(items: NodeListOf<HTMLElement> | HTMLElement[]): void;
    destroy(): void;
    update(): void;
    flipNext(): void;
    flipPrev(): void;
    turnToPage(page: number): void;
    getPageCount(): number;
    getCurrentPageIndex(): number;
    /** الأحداث المدعومة: flip | changeOrientation | changeState | init | update */
    on(event: 'flip' | 'changeOrientation' | 'changeState' | 'init' | 'update', cb: (e: PageFlipEvent) => void): void;
    off(event: string): void;
  }
}
