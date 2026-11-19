import { useCallback, useEffect, useRef, useState } from 'react';
import { Ban, Clock, Laptop, Lock, LogOut, Maximize, Minimize, RefreshCw, ShieldAlert, WifiOff } from 'lucide-react';
import {
  contentUrl, endSession, heartbeat, openSession, reportEvent, screenForError, takeoverSession,
} from './viewerApi';
import './ViewerPage.css';

const MAX_RECONNECT = 3;

function tokenFromPath(pathname) {
  const match = /^\/v\/([A-Za-z0-9_-]{20,})\/?$/.exec(pathname || '');
  return match ? match[1] : '';
}

function formatDateTime(value) {
  if (!value) return '';
  try {
    return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value));
  } catch { return ''; }
}

function formatTime(value) {
  try { return new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value)); }
  catch { return ''; }
}

// Parent-page guard: the lecture iframe has its own guard, this one covers the
// viewer shell (toolbar, state cards) and keyboard focus outside the frame.
function useShellGuard() {
  useEffect(() => {
    const stop = event => { event.preventDefault(); event.stopPropagation(); };
    const onKey = event => {
      const key = String(event.key || '').toLowerCase();
      const command = event.ctrlKey || event.metaKey;
      if (key === 'f12' || (command && event.shiftKey && ['i', 'j', 'c'].includes(key))
        || (command && ['u', 's', 'p'].includes(key)) || (event.metaKey && event.altKey && ['i', 'j', 'u'].includes(key))) stop(event);
    };
    document.addEventListener('contextmenu', stop, true);
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('dragstart', stop, true);
    return () => {
      document.removeEventListener('contextmenu', stop, true);
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('dragstart', stop, true);
    };
  }, []);
}

function StateCard({ icon, tone = 'neutral', title, children, actions }) {
  return <div className="slv-card" role="status">
    <span className={`slv-card__icon is-${tone}`}>{icon}</span>
    <h1>{title}</h1>
    {children && <div className="slv-card__body">{children}</div>}
    {actions && <div className="slv-card__actions">{actions}</div>}
    <footer>IIG Vietnam · Bài giảng bảo mật</footer>
  </div>;
}

export default function ViewerPage() {
  const token = tokenFromPath(window.location.pathname);
  const [screen, setScreen] = useState(token ? 'loading' : 'invalid');
  const [session, setSession] = useState(null);
  const [errorData, setErrorData] = useState(null);
  const [connection, setConnection] = useState('ok');
  const [fullscreen, setFullscreen] = useState(false);
  const stageRef = useRef(null);
  const frameRef = useRef(null);
  const openedRef = useRef(false);
  const sessionRef = useRef(null);
  const reportedRef = useRef(false);

  useShellGuard();

  useEffect(() => {
    document.title = 'Bài giảng · IIG';
    const robots = document.createElement('meta');
    robots.name = 'robots'; robots.content = 'noindex,nofollow';
    const referrer = document.createElement('meta');
    referrer.name = 'referrer'; referrer.content = 'no-referrer';
    document.head.append(robots, referrer);
    return () => { robots.remove(); referrer.remove(); };
  }, []);

  const fail = useCallback(error => {
    sessionRef.current = null;
    setSession(null);
    setErrorData(error?.data || null);
    setScreen(screenForError(error));
  }, []);

  const start = useCallback(async (action) => {
    setScreen('loading');
    try {
      const data = await action();
      sessionRef.current = data.sessionId;
      setSession(data);
      setConnection('ok');
      setScreen('presenting');
    } catch (error) { fail(error); }
  }, [fail]);

  const open = useCallback(() => start(() => openSession(token)), [start, token]);
  const takeover = useCallback(kickSessionId => start(() => takeoverSession(token, kickSessionId)), [start, token]);

  // Open once (StrictMode mounts twice in development; the content ticket is single-use).
  useEffect(() => {
    if (!token || openedRef.current) return;
    openedRef.current = true;
    open();
  }, [token, open]);

  // Heartbeat while presenting.
  useEffect(() => {
    if (screen !== 'presenting' || !session?.sessionId) return undefined;
    let failures = 0;
    let retriedGone = false;
    const timer = window.setInterval(async () => {
      try {
        await heartbeat(session.sessionId);
        failures = 0;
        setConnection('ok');
      } catch (error) {
        if (error.code === 'NETWORK' || error.code === 'RATE_LIMITED' || error.status >= 500) {
          failures += 1;
          setConnection('reconnecting');
          if (failures >= MAX_RECONNECT) fail({ code: 'NETWORK' });
          return;
        }
        if (error.code === 'SESSION_GONE' && !retriedGone) { retriedGone = true; open(); return; }
        fail(error);
      }
    }, Math.max(10, Number(session.heartbeatSec) || 30) * 1000);
    return () => window.clearInterval(timer);
  }, [screen, session, fail, open]);

  // End the session when the tab goes away.
  useEffect(() => {
    const onHide = () => endSession(sessionRef.current);
    window.addEventListener('pagehide', onHide);
    return () => window.removeEventListener('pagehide', onHide);
  }, []);

  // DevTools heuristic on the top window (the frame cannot measure this). It is
  // only reported for the audit log, never used to hide content: embedded
  // browsers and side panels produce the same viewport gap, and blanking a
  // lesson by mistake costs more than the deterrent is worth.
  useEffect(() => {
    if (screen !== 'presenting') return undefined;
    const check = () => {
      if (document.fullscreenElement || reportedRef.current || !sessionRef.current) return;
      if ((window.outerWidth - window.innerWidth > 260) || (window.outerHeight - window.innerHeight > 300)) {
        reportedRef.current = true;
        reportEvent(sessionRef.current, 'devtools_suspected');
      }
    };
    const timer = window.setInterval(check, 2000);
    return () => window.clearInterval(timer);
  }, [screen]);

  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else stageRef.current?.requestFullscreen?.().catch(() => {});
    frameRef.current?.focus();
  };

  const exit = () => { endSession(sessionRef.current); sessionRef.current = null; setScreen('exited'); };

  if (screen === 'presenting' && session) {
    return <div className="slv-root slv-presenting">
      <header className="slv-bar">
        <Lock aria-hidden="true" />
        <strong>{session.lecture?.title || 'Bài giảng'}</strong>
        <span className="slv-bar__spacer" />
        <span className="slv-bar__meta">{session.recipientName}{session.expiresAt ? ` · hết hạn ${formatDateTime(session.expiresAt)}` : ''}</span>
        <span className={`slv-pill ${connection === 'ok' ? 'is-ok' : 'is-warn'}`}>{connection === 'ok' ? 'Đang kết nối' : 'Đang kết nối lại…'}</span>
        <button type="button" className="slv-btn is-dark" onClick={toggleFullscreen}>{fullscreen ? <Minimize /> : <Maximize />}{fullscreen ? 'Thoát toàn màn hình' : 'Toàn màn hình'}</button>
      </header>
      <main className="slv-stage" ref={stageRef}>
        <iframe
          ref={frameRef}
          title={session.lecture?.title || 'Bài giảng'}
          src={contentUrl(session.ticket)}
          sandbox="allow-scripts allow-presentation"
          allow="fullscreen; autoplay"
          referrerPolicy="no-referrer"
          onLoad={() => frameRef.current?.focus()}
        />
      </main>
    </div>;
  }

  const live = errorData?.liveSessions || [];
  const cards = {
    loading: <StateCard icon={<Lock />} tone="info" title="Đang kiểm tra quyền truy cập…" />,
    concurrent: <StateCard icon={<Laptop />} tone="warn" title="Bài giảng đang mở trên thiết bị khác"
      actions={<>
        <button type="button" className="slv-btn" onClick={exit}><LogOut />Thoát</button>
        {live[0] && <button type="button" className="slv-btn is-primary" onClick={() => takeover(live[0].sessionId)}>Đá thiết bị kia, mở ở đây</button>}
      </>}>
      <p>Link này chỉ cho mở <b>{live.length || 1} thiết bị cùng lúc</b>.</p>
      {live.map(item => <p key={item.sessionId}>Đang mở: <b>{item.deviceLabel}</b>{item.startedAt ? ` từ ${formatTime(item.startedAt)}` : ''}</p>)}
    </StateCard>,
    kicked: <StateCard icon={<LogOut />} tone="warn" title="Bài giảng đã được mở ở thiết bị khác"
      actions={<button type="button" className="slv-btn is-primary" onClick={open}><RefreshCw />Mở lại ở máy này</button>}>
      <p>Phiên trên máy này đã kết thúc.</p>
    </StateCard>,
    deviceLimit: <StateCard icon={<Ban />} tone="danger" title={errorData?.maxDevices ? `Đã đủ ${errorData.maxDevices} thiết bị cho link này` : 'Đã đủ số thiết bị cho link này'}>
      <p>Máy này chưa được đăng ký. Liên hệ người gửi link để gỡ bớt một thiết bị cũ.</p>
    </StateCard>,
    deviceBlocked: <StateCard icon={<Ban />} tone="danger" title="Thiết bị này đã bị chặn"><p>Liên hệ người gửi link nếu đây là nhầm lẫn.</p></StateCard>,
    deviceRemoved: <StateCard icon={<Ban />} tone="warn" title="Thiết bị này đã bị gỡ"
      actions={<button type="button" className="slv-btn is-primary" onClick={open}><RefreshCw />Mở lại</button>}>
      <p>Mở lại để đăng ký máy này như một thiết bị mới (nếu link còn chỗ).</p>
    </StateCard>,
    expired: <StateCard icon={<Clock />} title="Link đã hết hạn"><p>{errorData?.expiresAt ? `Link hết hiệu lực lúc ${formatDateTime(errorData.expiresAt)}. ` : ''}Liên hệ người gửi để được gia hạn.</p></StateCard>,
    revoked: <StateCard icon={<Ban />} title="Link đã bị thu hồi"><p>Liên hệ người gửi nếu bạn vẫn cần dùng bài giảng.</p></StateCard>,
    notStarted: <StateCard icon={<Clock />} tone="info" title="Link chưa đến thời gian sử dụng"><p>{errorData?.validFrom ? `Có thể mở từ ${formatDateTime(errorData.validFrom)}.` : ''}</p></StateCard>,
    rateLimited: <StateCard icon={<ShieldAlert />} tone="warn" title="Thao tác quá nhanh"
      actions={<button type="button" className="slv-btn" onClick={open}><RefreshCw />Thử lại</button>}><p>Vui lòng thử lại sau ít phút.</p></StateCard>,
    network: <StateCard icon={<WifiOff />} tone="warn" title="Mất kết nối"
      actions={<button type="button" className="slv-btn is-primary" onClick={open}><RefreshCw />Thử lại</button>}><p>Kiểm tra mạng rồi thử lại.</p></StateCard>,
    exited: <StateCard icon={<LogOut />} title="Bạn đã thoát"
      actions={<button type="button" className="slv-btn" onClick={open}>Mở lại</button>} />,
    invalid: <StateCard icon={<Ban />} tone="danger" title="Link không hợp lệ"><p>Kiểm tra lại link hoặc liên hệ người gửi.</p></StateCard>,
  };
  return <div className="slv-root slv-center">{cards[screen] || cards.invalid}</div>;
}
