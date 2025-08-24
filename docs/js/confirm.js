// docs/js/confirm.js
// openConfirmTwoStep(title, rows, startSend)
// rows: Array<[label, value]>
// startSend: () => Promise<any>   // 点击“打开钱包核对”时调用，返回等待中的 Promise（例如 tx.wait() 或 approveHash 的等待）
//
// 返回 Promise<{ proceed: boolean, txPromise?: Promise<any> }>
// - proceed=false：用户取消
// - proceed=true：用户点击“完成”，并且我们会把 startSend 返回的 Promise 传回（可能尚未 resolve/reject）

function injectStyleOnce() {
  if (document.getElementById('cfm-style')) return;
  const css = `
  .cfm-overlay{position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:9999}
  .cfm-card{background:#fff;max-width:760px;width:calc(100% - 40px);border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.2);overflow:hidden;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif}
  .cfm-hd{padding:14px 18px;border-bottom:1px solid #eee;font-weight:600}
  .cfm-bd{max-height:62vh;overflow:auto;padding:12px 18px}
  .cfm-table{width:100%;border-collapse:collapse;font-size:14px}
  .cfm-table th,.cfm-table td{border-bottom:1px dashed #eee;vertical-align:top;padding:8px 6px;word-break:break-all}
  .cfm-table th{width:200px;color:#444;text-align:left}
  .cfm-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;padding:12px 18px;border-top:1px solid #eee}
  .cfm-checks{display:flex;gap:12px;align-items:center;font-size:13px;color:#333;flex-wrap:wrap}
  .cfm-btns{display:flex;gap:8px}
  .cfm-btn{padding:8px 14px;border:0;border-radius:8px;cursor:pointer}
  .cfm-btn.cancel{background:#eee}
  .cfm-btn.primary{background:#111;color:#fff}
  .cfm-note{font-size:12px;color:#666;margin-left:6px}
  .cfm-warn{color:#b00020;font-weight:600}
  `;
  const style = document.createElement('style');
  style.id = 'cfm-style';
  style.textContent = css;
  document.head.appendChild(style);
}

export function openConfirmTwoStep(title, rows, startSend) {
  injectStyleOnce();
  return new Promise((resolve) => {
    let txPromise = null;
    let walletOpened = false;

    const overlay = document.createElement('div');
    overlay.className = 'cfm-overlay';

    const card = document.createElement('div');
    card.className = 'cfm-card';

    const hd = document.createElement('div');
    hd.className = 'cfm-hd';
    hd.textContent = title || '请确认交易参数';

    const bd = document.createElement('div');
    bd.className = 'cfm-bd';

    const table = document.createElement('table');
    table.className = 'cfm-table';
    (rows || []).forEach(([k, v]) => {
      const tr = document.createElement('tr');
      const th = document.createElement('th'); th.textContent = k;
      const td = document.createElement('td'); td.textContent = String(v ?? '');
      tr.appendChild(th); tr.appendChild(td); table.appendChild(tr);
    });

    const tip = document.createElement('div');
    tip.className = 'cfm-note';
    tip.textContent = '提示：请确保下方参数与你钱包弹窗一致；如有不一致，请取消。';

    bd.appendChild(table); bd.appendChild(tip);

    const ft = document.createElement('div');
    ft.className = 'cfm-foot';

    const checks = document.createElement('div');
    checks.className = 'cfm-checks';
    const ck1 = document.createElement('input'); ck1.type = 'checkbox'; ck1.id = 'ck-params';
    const lb1 = document.createElement('label'); lb1.htmlFor = 'ck-params'; lb1.textContent = '我已核对参数与钱包弹窗一致';
    checks.appendChild(ck1); checks.appendChild(lb1);

    const btns = document.createElement('div'); btns.className = 'cfm-btns';
    const bCancel = document.createElement('button'); bCancel.className = 'cfm-btn cancel'; bCancel.textContent = '取消';
    const bOpen = document.createElement('button'); bOpen.className = 'cfm-btn primary'; bOpen.textContent = '打开钱包核对';
    const bDone = document.createElement('button'); bDone.className = 'cfm-btn primary'; bDone.textContent = '完成'; bDone.disabled = true;

    btns.appendChild(bCancel); btns.appendChild(bOpen); btns.appendChild(bDone);

    ft.appendChild(checks); ft.appendChild(btns);

    card.appendChild(hd); card.appendChild(bd); card.appendChild(ft);
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    const updateDoneState = () => {
      bDone.disabled = !(walletOpened && ck1.checked);
    };

    ck1.addEventListener('change', updateDoneState);

    bOpen.onclick = async () => {
      if (walletOpened) return;
      walletOpened = true;
      bOpen.disabled = true;
      bOpen.textContent = '已请求打开钱包…';
      try {
        // 触发钱包弹窗（但不 await），把 Promise 保存起来
        txPromise = Promise.resolve().then(() => startSend && startSend());
      } catch (e) {
        // startSend 同步抛错
        const row = document.createElement('div');
        row.className = 'cfm-note cfm-warn';
        row.textContent = '启动钱包失败：' + (e?.message || String(e));
        bd.appendChild(row);
        walletOpened = false;
        bOpen.disabled = false;
        bOpen.textContent = '打开钱包核对';
        txPromise = null;
      }
      updateDoneState();
    };

    const close = (proceed) => {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      resolve({ proceed, txPromise });
    };

    bDone.onclick = () => close(true);
    bCancel.onclick = () => close(false);

    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(false); });
    document.addEventListener('keydown', function esc(e){
      if (e.key === 'Escape'){ document.removeEventListener('keydown', esc); close(false); }
    });
  });
}
