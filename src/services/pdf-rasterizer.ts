import sharp from "sharp";
import { createCanvas } from "canvas";

export interface RenderedPage {
  pageNumber: number;
  width: number;
  height: number;
  imageBuffer: Buffer;
}

export interface BoundingBox {
  ymin: number; // 0 to 1000
  xmin: number; // 0 to 1000
  ymax: number; // 0 to 1000
  xmax: number; // 0 to 1000
}

export class PdfRasterizerService {
  /**
   * Render all or selected pages of a PDF to high-resolution PNG image buffers using pdfjs-dist & node-canvas
   */
  async renderPdfPages(
    pdfBuffer: Buffer,
    options: { scale?: number; maxPages?: number } = {}
  ): Promise<RenderedPage[]> {
    const scale = options.scale ?? 2.0; // 2x scale (~144-150 DPI) for crisp diagram quality
    const maxPages = options.maxPages ?? 50;

    // Dynamically import ESM pdfjs-dist
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(pdfBuffer),
      useSystemFonts: true,
      disableFontFace: false,
    });

    const pdfDocument = await loadingTask.promise;
    const numPages = Math.min(pdfDocument.numPages, maxPages);
    const renderedPages: RenderedPage[] = [];

    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      const page = await pdfDocument.getPage(pageNum);
      const viewport = page.getViewport({ scale });

      const canvas = createCanvas(Math.floor(viewport.width), Math.floor(viewport.height));
      const context = canvas.getContext("2d");

      // Set white background for transparent PDF elements
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);

      const renderContext = {
        canvasContext: context as any,
        viewport,
        canvas: canvas as any,
      };

      await page.render(renderContext).promise;

      const pageBuffer = canvas.toBuffer("image/png");
      renderedPages.push({
        pageNumber: pageNum,
        width: canvas.width,
        height: canvas.height,
        imageBuffer: pageBuffer,
      });
    }

    return renderedPages;
  }

  /**
   * Crop an image area using normalized coordinates [ymin, xmin, ymax, xmax] (0 to 1000 scale)
   * and convert to an optimized WebP image with auto-trimming padding.
   */
  async cropRegion(
    pageBuffer: Buffer,
    pageWidth: number,
    pageHeight: number,
    box: BoundingBox,
    paddingPx: number = 8
  ): Promise<Buffer> {
    // Convert 0..1000 coordinates to actual pixel bounds
    const topNorm = Math.max(0, Math.min(1000, box.ymin));
    const leftNorm = Math.max(0, Math.min(1000, box.xmin));
    const bottomNorm = Math.max(0, Math.min(1000, box.ymax));
    const rightNorm = Math.max(0, Math.min(1000, box.xmax));

    let top = Math.floor((topNorm / 1000) * pageHeight) - paddingPx;
    let left = Math.floor((leftNorm / 1000) * pageWidth) - paddingPx;
    let bottom = Math.ceil((bottomNorm / 1000) * pageHeight) + paddingPx;
    let right = Math.ceil((rightNorm / 1000) * pageWidth) + paddingPx;

    // Clamp coordinates
    top = Math.max(0, top);
    left = Math.max(0, left);
    bottom = Math.min(pageHeight, bottom);
    right = Math.min(pageWidth, right);

    const width = Math.max(1, right - left);
    const height = Math.max(1, bottom - top);

    // Crop and convert to clean high-quality webp
    return await sharp(pageBuffer)
      .extract({ left, top, width, height })
      .webp({ quality: 90 })
      .toBuffer();
  }
}

export const pdfRasterizerService = new PdfRasterizerService();
