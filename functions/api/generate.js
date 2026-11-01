// functions/api/generate.js
// CALIS CNMARC 草稿生成器 —— 纯文本输出
// 所有规则基于 CALIS 联合目录编目细则（200/210/215/010/225/410/7XX）

function clean(value) {
  return (value || '').trim();
}

function halfWidthPunct(str) {
  // 将常见的全角 ISBD 著录标识符转为半角（编目员添加的标识符应半角）
  return str
    .replace(/：/g, ':')
    .replace(/；/g, ';')
    .replace(/，/g, ',')
    .replace(/（/g, '(')
    .replace(/）/g, ')')
    .replace(/。/g, '.');
}

export async function onRequestPost(context) {
  try {
    const data = await context.request.json();

    const title = clean(data.title);
    const subtitle = clean(data.subtitle);
    const author1 = clean(data.author1);
    const authorsOther = clean(data.authors_other);
    const noteResp = clean(data.note_resp);
    const place = clean(data.place);
    const publisher = clean(data.publisher);
    const year = clean(data.year);
    const pages = clean(data.pages);
    const size = clean(data.size);
    const isbn = clean(data.isbn).replace(/-/g, '');
    const price = clean(data.price);
    const series = clean(data.series);
    const seriesVol = clean(data.series_volume);
    const holdingCode = clean(data.holding_code);
    const callNumber = clean(data.call_number);

    if (!title || !author1 || !place || !publisher || !year || !pages) {
      return new Response('缺少必备字段（正题名、第一责任者、出版地、出版者、出版年、页数）。', { status: 400 });
    }

    const lines = [];

    // ---------- 200 题名与责任说明 ----------
    // 指示符通常为 1#（1=题名是检索点，第2指示符未定义用空格）
    let f200 = `200 1# $a${title}`;
    if (subtitle) {
      f200 += `$e${halfWidthPunct(subtitle)}`;
    }

    // 200 $f：第一责任者。CALIS 规定 $f 只录第一个责任者，其余进 $g 或 304
    f200 += `$f${author1}`;

    // 200 $g：其他责任者。用“；”隔开，但 MARC 中 $g 可重复，这里合并为一个 $g 并保留分隔
    if (authorsOther) {
      const others = authorsOther.split(/[；;]/).map(s => s.trim()).filter(Boolean);
      if (others.length > 0) {
        f200 += `$g${halfWidthPunct(others.join('; '))}`;
      }
    }

    lines.push(f200);

    // ---------- 304 题名与责任说明附注 ----------
    // CALIS 优先使用专指附注字段，304 用于责任说明的补充/省略说明
    if (noteResp) {
      lines.push(`304 ## $a${halfWidthPunct(noteResp)}`);
    }

    // ---------- 210 出版发行 ----------
    // 指示符未定义，填两个空格（CALIS 规则：未定义指示符填空格，不是 0）
    lines.push(`210 ## $a${place}$c${publisher}$d${year}`);

    // ---------- 215 载体形态 ----------
    let f215 = `215 ## $a${pages}`;
    if (size) {
      f215 += `$d${size}`;
    }
    lines.push(f215);

    // ---------- 010 ISBN ----------
    if (isbn) {
      let f010 = `010 ## $a${isbn}`;
      if (price) {
        f010 += `$d${price}`;
      }
      lines.push(f010);
    }

    // ---------- 225 丛编项 + 410 丛编连接 ----------
    if (series) {
      // 225 第1指示符：2 = 丛编题名与检索点形式相同（CALIS 常用 2#）
      let f225 = `225 2# $a${series}`;
      if (seriesVol) {
        f225 += `$v${seriesVol}`;
      }
      lines.push(f225);

      // 410 使用 CALIS 的 $1 嵌入字段技术
      // 格式：410 #0 $1 [完整的 200 字段标识符 + 指示符 + 子字段]
      // 第2指示符通常为 0（不生成附注），由 308 或人工承担丛编说明
      let embedded200 = `2001#$a${series}`;
      if (seriesVol) {
        embedded200 += `$v${seriesVol}`;
      }
      lines.push(`410 #0 $1${embedded200}`);
    }

    // ---------- 7XX 知识责任 ----------
    // 701：第一责任者（个人）的检索点。这里做简化处理：去掉责任方式后缀（著/编/译等），
    // 只保留人名。CALIS 规范档核查需要人工完成，工具只生成草稿。
    const personName = author1.replace(/[著编译校注整理任主编].*$/, '').trim();
    if (personName) {
      lines.push(`701 #0 $a${personName}`);
    }

    // 702：其他责任者（个人）
    if (authorsOther) {
      const others = authorsOther.split(/[；;]/).map(s => s.trim()).filter(Boolean);
      for (const other of others.slice(0, 2)) {
        const otherName = other.replace(/[著编译校注整理任主编].*$/, '').trim();
        if (otherName) {
          lines.push(`702 #0 $a${otherName}`);
        }
      }
    }

    // ---------- 905 馆藏（可选） ----------
    if (holdingCode || callNumber) {
      let f905 = `905 ## `;
      if (holdingCode) f905 += `$a${holdingCode} `;
      if (callNumber) f905 += `$d${callNumber}`;
      lines.push(f905.trim());
    }

    const marc = lines.join('\n');

    return new Response(JSON.stringify({ marc }), {
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  } catch (error) {
    return new Response('处理请求时出错：' + error.message, { status: 500 });
  }
}
