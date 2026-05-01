// CYPARK QR — uses QRCode.js library (correct API)

function generateQR(text) {
  try {
    // QRCode.js (qrcodejs) uses: new QRCode(el, options)
    // For data URL, we create a temp div, render, get canvas src
    const tmp = document.createElement('div');
    tmp.style.cssText = 'position:absolute;left:-9999px;top:-9999px;';
    document.body.appendChild(tmp);
    new QRCode(tmp, {
      text: text,
      width: 180, height: 180,
      colorDark: '#000000', colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.M
    });
    const canvas = tmp.querySelector('canvas');
    const img = tmp.querySelector('img');
    let src = '';
    if (canvas) src = canvas.toDataURL('image/png');
    else if (img) src = img.src;
    document.body.removeChild(tmp);
    return src;
  } catch(e) {
    console.warn('QR gen error:', e);
    return '';
  }
}

function makeQRData(session_id, slot_id, plate, entry_time) {
  return `CYPARK|${session_id}|${slot_id}|${plate}|${entry_time}`;
}

function parseQR(qrString) {
  try {
    const parts = qrString.trim().split('|');
    if (parts.length === 5 && parts[0] === 'CYPARK') {
      return { session_id: parts[1], slot_id: parts[2], plate: parts[3], entry: parts[4] };
    }
  } catch (e) {}
  return null;
}
