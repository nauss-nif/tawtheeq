// إعلان مبسّط لمكتبة page-flip (لا توفر أنواعًا رسمية كاملة)
declare module 'page-flip' {
  export class PageFlip {
    constructor(element: HTMLElement, settings: Record<string, unknown>);
    loadFromHTML(items: NodeListOf<HTMLElement> | HTMLElement[]): void;
    destroy(): void;
    flipNext(): void;
    flipPrev(): void;
  }
}
