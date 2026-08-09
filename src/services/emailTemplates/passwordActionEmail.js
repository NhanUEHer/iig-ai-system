const escapeHtml = value => String(value || '').replace(/[&<>'"]/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
})[character]);

function buildPasswordActionEmail({ name, actionUrl, purpose }) {
  const isSetup = purpose === 'setup';
  const safeName = escapeHtml(name || 'bạn');
  const safeUrl = escapeHtml(actionUrl);
  const subject = isSetup ? 'Thiết lập tài khoản IIG Admin' : 'Khôi phục mật khẩu IIG Admin';
  const heading = isSetup ? 'Chào mừng bạn đến với IIG Admin' : 'Yêu cầu khôi phục mật khẩu';
  const description = isSetup
    ? 'Tài khoản của bạn đã được tạo. Hãy thiết lập mật khẩu để hoàn tất kích hoạt và bắt đầu sử dụng hệ thống.'
    : 'Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản của bạn.';
  const actionLabel = isSetup ? 'Thiết lập mật khẩu' : 'Đặt lại mật khẩu';
  const text = [`Xin chào ${name || 'bạn'},`, '', description, '', `${actionLabel}: ${actionUrl}`, '',
    'Liên kết có hiệu lực trong 60 phút và chỉ sử dụng được một lần.',
    'Nếu bạn không thực hiện yêu cầu này, hãy bỏ qua email.', '', 'IIG Admin',
    'IIG Viet Nam Digital Product Department © 2026'].join('\n');
  const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#f2f4f7;font-family:Arial,Helvetica,sans-serif;color:#182230">
<div style="display:none;max-height:0;overflow:hidden">${escapeHtml(description)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f2f4f7;padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#fff;border:1px solid #e4e7ec;border-radius:18px;overflow:hidden">
<tr><td style="padding:24px 32px;background:#0b2d59;color:#fff"><div style="font-size:20px;font-weight:700">IIG Admin</div><div style="margin-top:4px;color:#b9d5f3;font-size:12px">Digital Product Operations Platform</div></td></tr>
<tr><td style="padding:36px 32px 12px"><div style="display:inline-block;padding:6px 10px;border-radius:999px;background:#eff4ff;color:#155eef;font-size:12px;font-weight:700">BẢO MẬT TÀI KHOẢN</div><h1 style="margin:18px 0 12px;font-size:25px;line-height:1.3;color:#101828">${heading}</h1><p style="margin:0 0 14px;font-size:15px;line-height:1.7;color:#475467">Xin chào <strong>${safeName}</strong>,</p><p style="margin:0;font-size:15px;line-height:1.7;color:#475467">${description}</p></td></tr>
<tr><td style="padding:22px 32px"><a href="${safeUrl}" style="display:inline-block;padding:14px 22px;background:#155eef;color:#fff;text-decoration:none;border-radius:10px;font-size:14px;font-weight:700">${actionLabel}</a></td></tr>
<tr><td style="padding:0 32px 32px"><div style="padding:16px;background:#f8fafc;border:1px solid #eaecf0;border-radius:10px;color:#667085;font-size:13px;line-height:1.6">Liên kết có hiệu lực trong <strong>60 phút</strong> và chỉ sử dụng được một lần. Nếu nút không hoạt động, sao chép liên kết sau vào trình duyệt:<br><a href="${safeUrl}" style="color:#155eef;word-break:break-all">${safeUrl}</a></div><p style="margin:18px 0 0;color:#667085;font-size:13px;line-height:1.6">Nếu bạn không thực hiện yêu cầu này, hãy bỏ qua email. Mật khẩu hiện tại của bạn sẽ không thay đổi.</p></td></tr>
<tr><td style="padding:20px 32px;border-top:1px solid #eaecf0;color:#98a2b3;font-size:11px;line-height:1.6">Email tự động từ IIG Admin · IIG Viet Nam Digital Product Department © 2026</td></tr>
</table></td></tr></table></body></html>`;
  return { subject, text, html };
}

module.exports = { buildPasswordActionEmail, escapeHtml };
