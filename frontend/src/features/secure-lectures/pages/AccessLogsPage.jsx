import React from 'react';
import { Link } from 'react-router-dom';
import AccessLogTable from '../components/AccessLogTable';
import './LibraryPage.css';
import './LectureDetailPage.css';

export default function AccessLogsPage() {
  return <div className="sl-page"><div className="sl-frame sl-detail"><nav className="sl-breadcrumb"><Link to="/secure-lectures">Bài giảng bảo mật</Link><span>/</span><strong>Nhật ký truy cập</strong></nav><header className="sl-page-head"><h1>Nhật ký truy cập</h1></header><section className="sl-detail-panel sl-logs-page"><AccessLogTable /></section></div></div>;
}
