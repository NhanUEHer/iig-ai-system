const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

function buildReportNotificationEmail({name,eventName,periodLabel,teamName,deadline,actionUrl,message}) {
  const subject=`[IIG Workspace] ${eventName} · ${teamName} · ${periodLabel}`;
  const deadlineText=deadline?new Date(deadline).toLocaleString('vi-VN'):'Không giới hạn';
  return {subject,text:`Xin chào ${name||'bạn'},\n\n${message}\nKỳ: ${periodLabel}\nPhiếu: ${teamName}\nHạn nhập liệu: ${deadlineText}\n\nMở phiếu: ${actionUrl}`,
    html:`<div style="font-family:Arial,sans-serif;color:#172033;max-width:640px;margin:auto"><div style="background:#2864f0;color:#fff;padding:22px 26px;border-radius:12px 12px 0 0"><b>IIG Workspace</b><h2 style="margin:8px 0 0">${escape(eventName)}</h2></div><div style="border:1px solid #dce4f2;border-top:0;padding:26px;border-radius:0 0 12px 12px"><p>Xin chào <b>${escape(name||'bạn')}</b>,</p><p>${escape(message)}</p><table style="width:100%;background:#f5f8ff;padding:14px;border-radius:8px"><tr><td>Kỳ báo cáo</td><td><b>${escape(periodLabel)}</b></td></tr><tr><td>Phiếu</td><td><b>${escape(teamName)}</b></td></tr><tr><td>Hạn nhập liệu</td><td>${escape(deadlineText)}</td></tr></table><p style="margin:24px 0"><a href="${escape(actionUrl)}" style="background:#2864f0;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:bold">Mở phiếu báo cáo</a></p><small>Liên kết yêu cầu đăng nhập và hệ thống sẽ kiểm tra quyền truy cập trước khi hiển thị dữ liệu.</small></div></div>`};
}
module.exports={buildReportNotificationEmail};
