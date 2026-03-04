/**
 * PDF export utility — dynamically imports html2canvas + jspdf
 * so they are NOT included in the initial bundle (code-split).
 */

export async function exportViewToPdf(
  element: HTMLElement,
  viewName: string
): Promise<void> {
  const [html2canvas, { jsPDF }] = await Promise.all([
    import('html2canvas').then(m => m.default),
    import('jspdf'),
  ]);

  // Capture the element at 2x resolution for crisp output
  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    logging: false,
    // Preserve current theme (dark/light)
    backgroundColor: null,
  });

  const imgData = canvas.toDataURL('image/png');
  const imgWidth = canvas.width;
  const imgHeight = canvas.height;

  // Choose landscape for wide content, portrait for tall
  const orientation = imgWidth > imgHeight * 1.2 ? 'landscape' : 'portrait';
  const pdf = new jsPDF({ orientation, unit: 'pt', format: 'a4' });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  const margin = 24;
  const headerH = 28;

  // Scale image to fit page width (minus margins)
  const usableWidth = pageWidth - margin * 2;
  const scale = usableWidth / imgWidth;
  const scaledHeight = imgHeight * scale;

  const usablePageHeight = pageHeight - margin - headerH;

  // Draw header on each page, then slice the image across pages
  let srcY = 0;
  let pageNum = 0;

  while (srcY < scaledHeight) {
    if (pageNum > 0) pdf.addPage();

    // Header
    pdf.setFontSize(9);
    pdf.setTextColor(120);
    pdf.text(`KUHL Pricing Tracker  —  ${viewName}`, margin, margin + 4);
    const dateStr = new Date().toLocaleString();
    pdf.text(dateStr, pageWidth - margin - pdf.getTextWidth(dateStr), margin + 4);
    pdf.setDrawColor(200);
    pdf.line(margin, headerH, pageWidth - margin, headerH);

    // Image slice for this page
    pdf.addImage(
      imgData,
      'PNG',
      margin,
      headerH + 4 - srcY,
      usableWidth,
      scaledHeight,
    );

    // Clip to the page (jspdf clips automatically outside page bounds)
    srcY += usablePageHeight;
    pageNum++;
  }

  const fileDateStr = new Date().toISOString().split('T')[0];
  pdf.save(`KUHL_${viewName.replace(/[\s/]+/g, '_')}_${fileDateStr}.pdf`);
}
