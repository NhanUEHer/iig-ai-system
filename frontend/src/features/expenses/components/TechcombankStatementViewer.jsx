import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, RefreshCw } from 'lucide-react';
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export default function TechcombankStatementViewer({ url, anchor }) {
  const canvasRef = useRef(null);
  const stageRef = useRef(null);
  const [document, setDocument] = useState(null);
  const [pageNumber, setPageNumber] = useState(Number(anchor?.page) || 1);
  const [highlight, setHighlight] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const task = pdfjs.getDocument(url);
    task.promise.then(pdf => { if (!cancelled) { setDocument(pdf); setPageNumber(Math.min(Number(anchor?.page) || 1, pdf.numPages)); } }).catch(() => !cancelled && setError('Không thể render file PDF.')).finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; task.destroy(); };
  }, [url, anchor?.page]);

  useEffect(() => {
    if (!document || !canvasRef.current || !stageRef.current) return;
    let cancelled = false;
    let renderTask;
    const render = async () => {
      setLoading(true);
      const page = await document.getPage(pageNumber);
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(2.2, Math.max(.75, (stageRef.current.clientWidth - 32) / base.width));
      const viewport = page.getViewport({ scale });
      const ratio = window.devicePixelRatio || 1;
      const canvas = canvasRef.current;
      canvas.width = Math.floor(viewport.width * ratio);
      canvas.height = Math.floor(viewport.height * ratio);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      renderTask = page.render({ canvasContext: canvas.getContext('2d'), viewport, transform: ratio === 1 ? null : [ratio, 0, 0, ratio, 0, 0] });
      await renderTask.promise;
      if (cancelled) return;
      const hasRectangle = [anchor?.x, anchor?.y, anchor?.width, anchor?.height].every(value => Number.isFinite(Number(value)));
      if (Number(anchor?.page) === pageNumber && hasRectangle) {
        const rectangle = viewport.convertToViewportRectangle([anchor.x, anchor.y - 5, anchor.x + anchor.width, anchor.y + anchor.height - 5]);
        const left = Math.min(rectangle[0], rectangle[2]), top = Math.min(rectangle[1], rectangle[3]);
        const nextHighlight={ left, top, width: Math.abs(rectangle[2] - rectangle[0]), height: Math.max(24, Math.abs(rectangle[3] - rectangle[1])) };
        setHighlight(nextHighlight);
        requestAnimationFrame(()=>stageRef.current?.scrollTo({top:Math.max(0,top-stageRef.current.clientHeight/2),behavior:'smooth'}));
      } else setHighlight(null);
      setLoading(false);
    };
    render().catch(error => { if (error?.name !== 'RenderingCancelledException') setError('Không thể render trang PDF.'); setLoading(false); });
    return () => { cancelled = true; renderTask?.cancel(); };
  }, [document, pageNumber, anchor]);

  if (error) return <div className="statement-preview-state error"><strong>{error}</strong></div>;
  return <div className="tech-statement-viewer"><header><span>Trang <strong>{pageNumber}</strong> / {document?.numPages || '…'}</span><div><button disabled={pageNumber <= 1} onClick={() => setPageNumber(page => page - 1)} title="Trang trước"><ArrowLeft/></button><button className="active-row" disabled={pageNumber === Number(anchor?.page)} onClick={() => setPageNumber(Number(anchor?.page) || 1)}>Dòng đang chọn</button><button disabled={!document || pageNumber >= document.numPages} onClick={() => setPageNumber(page => page + 1)} title="Trang sau"><ArrowRight/></button></div></header><div className="tech-statement-stage" ref={stageRef}>{loading && <div className="tech-statement-loading"><RefreshCw className="spin"/>Đang render…</div>}<div className="tech-statement-page"><canvas ref={canvasRef}/>{highlight && <div className="tech-statement-highlight" style={highlight}><span>Giao dịch đang xem</span></div>}</div></div></div>;
}
