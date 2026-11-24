(function () {
  'use strict';

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ------------------------------------------------------------ header nav */
  var nav = $('#nav');
  var navToggle = $('#nav-toggle');
  var scrim = $('#scrim');

  function setNav(open) {
    if (!nav || !navToggle) return;
    nav.classList.toggle('is-open', open);
    navToggle.classList.toggle('is-open', open);
    navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    navToggle.setAttribute('aria-label', open ? '메뉴 닫기' : '메뉴 열기');
    if (scrim) scrim.classList.toggle('is-open', open);
    document.body.classList.toggle('is-locked', open);
  }
  if (navToggle) navToggle.addEventListener('click', function () { setNav(!nav.classList.contains('is-open')); });
  if (scrim) scrim.addEventListener('click', function () { setNav(false); });
  if (nav) $$('a', nav).forEach(function (a) { a.addEventListener('click', function () { setNav(false); }); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && nav && nav.classList.contains('is-open')) setNav(false);
  });

  /* ------------------------------------------------------------ lightbox */
  var lightbox = $('#lightbox');
  var lbImg = $('#lightbox-img');
  var lbCap = $('#lightbox-cap');
  var lbCredit = $('#lightbox-credit');
  var lbFigure = $('#lb-figure');
  var lbList = [];
  var lbIndex = 0;

  function openDialog(node) {
    if (!node) return;
    node.classList.add('is-open');
    node.setAttribute('aria-hidden', 'false');
    document.body.classList.add('is-locked');
    var btn = node.querySelector('.lightbox__close, .modal__close');
    if (btn) { try { btn.focus(); } catch (e) {} }
  }
  function closeDialog(node) {
    if (!node) return;
    node.classList.remove('is-open');
    node.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('is-locked');
  }

  function renderLb() {
    var btn = lbList[lbIndex];
    if (!btn) return;
    lbImg.src = btn.getAttribute('data-zoom');
    lbImg.alt = btn.getAttribute('data-cap') || '범어자이 공식 홈페이지 이미지';
    lbCap.textContent = btn.getAttribute('data-cap') || '';
    var poster = btn.getAttribute('data-poster') === '1';
    if (lbFigure) lbFigure.classList.toggle('is-poster', poster);
    if (lightbox) lightbox.classList.toggle('is-single', lbList.length < 2);
    if (lightbox) lightbox.scrollTop = 0;
    if (lbFigure) lbFigure.scrollTop = 0;
  }
  function stepLb(dir) {
    if (lbList.length < 2) return;
    lbIndex = (lbIndex + dir + lbList.length) % lbList.length;
    renderLb();
  }
  document.addEventListener('click', function (e) {
    var trigger = e.target.closest('[data-zoom]');
    if (trigger) {
      e.preventDefault();
      var group = trigger.getAttribute('data-group') || '';
      var scope = group ? document.getElementById(group) : document;
      lbList = $$('[data-zoom]', scope || document).filter(function (b) { return !b.closest('[hidden]'); });
      lbIndex = Math.max(0, lbList.indexOf(trigger));
      renderLb();
      openDialog(lightbox);
      return;
    }
    var closer = e.target.closest('[data-close]');
    if (closer) { closeDialog(closer.closest('.lightbox, .modal')); }
  });
  var prevBtn = $('#lb-prev'), nextBtn = $('#lb-next');
  if (prevBtn) prevBtn.addEventListener('click', function () { stepLb(-1); });
  if (nextBtn) nextBtn.addEventListener('click', function () { stepLb(1); });
  document.addEventListener('keydown', function (e) {
    if (!lightbox || !lightbox.classList.contains('is-open')) {
      if (lightbox && e.key === 'Escape') closeDialog(lightbox);
      return;
    }
    if (e.key === 'Escape') { closeDialog(lightbox); return; }
    if (e.key === 'ArrowLeft') { e.preventDefault(); stepLb(-1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); stepLb(1); }
  });

  /* ------------------------------------------------------------ block render */
  var IMG_GROUPS = 0;

  function imgButton(b, groupId, extra) {
    var poster = b.poster ? ' data-poster="1"' : '';
    var cap = b.cap || b.alt || '';
    return '<button class="arc-img' + (extra ? ' ' + extra : '') + '" type="button" data-zoom="' + esc(b.src) +
      '" data-cap="' + esc(cap) + '" data-group="' + esc(groupId) + '"' + poster +
      ' aria-label="' + esc((cap || '이미지') + ' 크게 보기') + '">' +
      '<img src="' + esc(b.src) + '" alt="' + esc(b.alt || cap) + '" loading="lazy" decoding="async"' +
      (b.w ? ' width="' + b.w + '" height="' + b.h + '"' : '') + ' />' +
      '</button>';
  }

  function renderImg(b, groupId) {
    if (!b.src) return '';
    if (b.poster) {
      return '<figure class="arc-poster">' +
        '<div class="arc-poster__frame">' + imgButton(b, groupId, 'arc-img--plain') + '</div>' +
        '<figcaption class="arc-poster__bar"><span><b>세로로 긴 안내문</b> · 안에서 스크롤하거나 눌러 크게 보세요</span>' +
        '<span>' + (b.w ? b.w + '×' + b.h + ' 원본' : '') + '</span></figcaption></figure>';
    }
    return '<figure class="arc-figure">' + imgButton(b, groupId) + '</figure>';
  }

  function renderTable(b, groupId) {
    var head = (b.head || []).filter(function (h) { return h; });
    var html = '<div class="arc-table-wrap"><table class="arc-table' +
      ((head.length > 3 || (b.rows[0] && b.rows[0].c.length > 3)) ? ' arc-table--scroll' : '') + '">';
    if (b.cap) html += '<caption class="sr-only">' + esc(b.cap) + '</caption>';
    if (head.length) {
      html += '<thead><tr>' + head.map(function (h, i) {
        return '<th scope="col"' + (i === 0 ? ' class="num"' : '') + '>' + esc(h) + '</th>';
      }).join('') + '</tr></thead>';
    }
    html += '<tbody>';
    (b.rows || []).forEach(function (r) {
      var cells = r.c || [];
      html += '<tr>';
      cells.forEach(function (c, i) {
        var txt = esc(c);
        var link = (r.url && i === 1) ? '<a href="' + esc(r.url) + '" target="_blank" rel="noopener">' + txt + '</a>' : txt;
        if (!head.length) {
          html += (i === 0) ? '<th scope="row">' + link + '</th>' : '<td>' + link + '</td>';
        } else {
          html += '<td' + ((i === 0 && head.length > 1) ? ' class="num"' : '') + '>' + link + '</td>';
        }
      });
      html += '</tr>';
    });
    html += '</tbody></table></div>';
    return html;
  }

  function renderTabs(b, groupId, secKey) {
    var items = (b.items || []).filter(function (it) { return it.images && it.images.length; });
    if (!items.length) return '';
    IMG_GROUPS += 1;
    var gid = secKey + '-' + IMG_GROUPS;
    var html = '<div class="arc-tabwrap"><div class="arc-tabs" role="tablist">';
    items.forEach(function (it, i) {
      html += '<button type="button" role="tab" id="' + gid + '-t' + i + '" aria-controls="' + gid + '-p' + i +
        '" aria-selected="' + (i === 0 ? 'true' : 'false') + '">' + esc(it.name) + '</button>';
    });
    html += '</div>';
    items.forEach(function (it, i) {
      html += '<div class="arc-panel" role="tabpanel" id="' + gid + '-p' + i + '" aria-labelledby="' + gid + '-t' + i + '"' +
        (i === 0 ? '' : ' hidden') + '>';
      it.images.forEach(function (im) { html += renderImg(im, groupId); });
      html += '</div>';
    });
    html += '</div>';
    return html;
  }

  function renderVideo(b, groupId, secKey) {
    var id = 'vid-' + (++IMG_GROUPS);
    var watch = b.yt ? 'https://www.youtube.com/watch?v=' + encodeURIComponent(b.yt) : b.src;
    return '<div class="arc-video" id="' + id + '">' +
      '<span class="arc-video__ico" aria-hidden="true">▶</span>' +
      '<span class="arc-video__txt"><b>' + esc(b.title || '영상') + '</b>' +
      '<em>' + (b.yt ? 'YouTube · GS건설 자이' : '원문 영상') + '</em></span>' +
      (b.yt ? '<button class="arc-video__go" type="button" data-play="' + esc(b.yt) + '" data-into="' + id + '">여기서 재생</button>' : '') +
      '<a class="arc-video__go" href="' + esc(watch) + '" target="_blank" rel="noopener">YouTube에서 보기</a>' +
      '</div>';
  }

  function renderEmodel(b) {
    return '<div class="arc-emodel"><div><p class="arc-emodel__k">3D VIRTUAL TOUR</p>' +
      '<h3>E-모델하우스 · 가상 3D 투어</h3>' +
      '<p>공식 사이트의 E-모델하우스는 3D 파노라마 투어 프로그램(TDV)으로만 동작해 이미지로 내려받아 담을 수 없습니다. ' +
      '그래서 이 아카이브에는 <b>투어로 들어가는 길</b>만 남겨 두었고, 화면은 원문에서 바로 열립니다. ' +
      '같은 내용의 평면·마감재·전시품목 도면은 이 아카이브의 ‘세대안내’에 모두 보존되어 있습니다.</p>' +
      '<a class="arc-btn arc-btn--solid" href="' + esc(b.url) + '" target="_blank" rel="noopener">E-모델하우스 열기 <span aria-hidden="true">↗</span></a>' +
      '</div></div>';
  }

  function renderBlocks(blocks, groupId, secKey) {
    var html = '';
    (blocks || []).forEach(function (b) {
      switch (b.t) {
        case 'img': html += renderImg(b, groupId); break;
        case 'tabs': html += renderTabs(b, groupId, secKey); break;
        case 'table': html += renderTable(b, groupId); break;
        case 'text':
          html += '<div class="arc-text">' + (b.lines || []).map(function (l) { return '<p>' + esc(l) + '</p>'; }).join('') + '</div>';
          break;
        case 'note':
          html += '<div class="arc-note">' + (b.lines || []).map(function (l) { return '<p>' + esc(l) + '</p>'; }).join('') + '</div>';
          break;
        case 'links':
          html += '<div class="arc-links">' + (b.items || []).map(function (l) {
            return '<a href="' + esc(l.url) + '" target="_blank" rel="noopener">' + esc(l.label) + ' <span aria-hidden="true">↗</span></a>';
          }).join('') + '</div>';
          break;
        case 'video': html += renderVideo(b, groupId, secKey); break;
        case 'emodel': html += renderEmodel(b); break;
        case 'h': html += '<p class="arc-h">' + esc(b.text) + '</p>'; break;
        default: break;
      }
    });
    return html;
  }

  /* ------------------------------------------------------------ construction */
  function renderConstruction(cons) {
    if (!cons) return '';
    var html = '';
    if (cons.image) {
      html += '<figure class="arc-figure"><button class="arc-img" type="button" data-zoom="' + esc(cons.image) +
        '" data-cap="범어자이 조감도 — 자이 공사정보" data-group="arc-cons" aria-label="조감도 크게 보기">' +
        '<img src="' + esc(cons.image) + '" alt="' + esc(cons.imageAlt || '범어자이 조감도') + '" loading="lazy" /></button></figure>';
    }
    if (cons.summary && cons.summary.length) {
      html += '<dl class="arc-spec">' + cons.summary.map(function (s) {
        return '<div><dt>' + esc(s.k) + '</dt><dd>' + esc(s.v) + '</dd></div>';
      }).join('') + '</dl>';
    }
    var months = cons.months || [];
    if (months.length) {
      var names = cons.workNames && cons.workNames.length ? cons.workNames : ['건축공사', '토목공사', '전기공사', '설비공사'];
      html += '<table class="arc-table arc-table--compact arc-table--scroll"><caption class="sr-only">월별 공정률</caption>' +
        '<thead><tr><th scope="col" class="num">기준월</th><th scope="col" class="num">전체</th>' +
        names.map(function (n) { return '<th scope="col" class="num">' + esc(n) + '</th>'; }).join('') +
        '</tr></thead><tbody>';
      months.forEach(function (m, i) {
        var det = m.detail || [];
        html += '<tr><td class="num">' + esc(m.label) + (i === 0 ? ' <b>·최신</b>' : '') + '</td>' +
          '<td class="num"><b>' + esc(m.total || '-') + '%</b></td>' +
          names.map(function (n, j) { return '<td class="num">' + esc(det[j] != null ? det[j] + '%' : '-') + '</td>'; }).join('') +
          '</tr>';
      });
      html += '</tbody></table>';
    }
    if (cons.photos && cons.photos.length) {
      html += '<p class="arc-h">공사현장 사진 ' + cons.photos.length + '장</p>';
      html += '<div class="arc-photo-grid">' + cons.photos.map(function (p) {
        return '<button class="arc-photo" type="button" data-zoom="' + esc(p.src) + '" data-group="arc-cons" ' +
          'data-cap="범어자이 공사현장 · ' + esc(p.date || '') + ' 촬영 (GS건설 자이 공사정보)" aria-label="공사현장 사진 ' + esc(p.date || '') + ' 크게 보기">' +
          '<img src="' + esc(p.src) + '" alt="범어자이 공사현장 ' + esc(p.date || '') + '" loading="lazy" decoding="async" />' +
          '<span>' + esc(p.date || '') + '</span></button>';
      }).join('') + '</div>';
    }
    return html;
  }


  /* ------------------------------------------------------------ main page */
  function renderMain(main) {
    if (!main) return '';
    var html = '';
    var slide = (main.slides || [])[0];
    if (slide && slide.pc) {
      html += '<figure class="arc-figure"><button class="arc-img" type="button" data-zoom="' + esc(slide.pc) +
        '" data-cap="공식 홈페이지 메인 화면 (xi.co.kr/dgb)" data-group="arc-main" aria-label="메인 화면 크게 보기">' +
        '<img src="' + esc(slide.pc) + '" alt="범어자이 공식 홈페이지 메인 화면" loading="lazy" /></button></figure>';
    }
    if (main.notices && main.notices.length) {
      html += '<div class="arc-links">' + main.notices.map(function (n) {
        return '<span class="arc-chip">' + esc(n) + '</span>';
      }).join('') + '</div>';
    }
    if (main.banners && main.banners.length) {
      html += '<p class="arc-h">메인에 걸려 있던 배너</p><div class="arc-links">' + main.banners.filter(function (b) { return b.url; }).map(function (b) {
        return '<a href="' + esc(b.url) + '" target="_blank" rel="noopener">' + esc(b.text) + ' <span aria-hidden="true">↗</span></a>';
      }).join('') + '</div>';
    }
    if (main.news && main.news.length) {
      html += '<p class="arc-h">메인에 걸려 있던 보도자료</p><div class="arc-text">' + main.news.map(function (n) {
        return '<p>' + (n.url ? '<a href="' + esc(n.url) + '" target="_blank" rel="noopener">' + esc(n.text) + '</a>' : esc(n.text)) + '</p>';
      }).join('') + '</div>';
    }
    if (main.popups && main.popups.length) {
      html += '<p class="arc-h">원문 접속 시 뜨던 공지 팝업</p><div class="arc-grid">' + main.popups.map(function (pp, i) {
        return '<button class="arc-img" type="button" data-zoom="' + esc(pp.src) + '" data-group="arc-main" ' +
          'data-cap="공식 홈페이지 공지 팝업 ' + (i + 1) + '" aria-label="공지 팝업 크게 보기">' +
          '<img src="' + esc(pp.src) + '" alt="공식 홈페이지 공지 팝업" loading="lazy" style="height:auto;object-fit:contain" /></button>';
      }).join('') + '</div>';
      if (main.popupLinks && main.popupLinks.length) {
        html += '<div class="arc-note"><p>팝업에 연결된 안내문(PDF)은 원문 링크로 남겨 둡니다 — ' +
          main.popupLinks.map(function (u) { return '<a href="' + esc(u) + '" target="_blank" rel="noopener">' + esc(u.split('/').pop()) + '</a>'; }).join(', ') + '</p></div>';
      }
    }
    return html;
  }

  /* ------------------------------------------------------------ mobile page */
  function renderMobile(m) {
    if (!m) return '';
    var html = '';
    if (m.image) {
      html += '<figure class="arc-figure"><button class="arc-img" type="button" data-zoom="' + esc(m.image) +
        '" data-cap="범어자이 단지정보 대표 이미지 (입주완료)" data-group="arc-mobile" aria-label="단지 대표 이미지 크게 보기">' +
        '<img src="' + esc(m.image) + '" alt="범어자이 단지정보 대표 이미지" loading="lazy" /></button></figure>';
    }
    html += '<dl class="arc-spec">';
    if (m.badge) html += '<div><dt>분양상태</dt><dd>' + esc(m.badge) + '</dd></div>';
    (m.specs || []).forEach(function (s) {
      html += '<div><dt>' + esc(s.k) + '</dt><dd>' + esc(s.v) + '</dd></div>';
    });
    html += '</dl>';
    (m.tabs || []).forEach(function (t) {
      html += '<p class="arc-h">' + esc(t.name) + '</p>' + renderTabs(t, 'arc-mobile', 'arc-mobile');
    });
    html += '<div class="arc-note"><p>단지 위치도는 카카오맵 위젯으로 그려지는 지도라 이미지로 담지 않았습니다. 주소는 ' +
      esc(m.address || '대구광역시 수성구 범어동 48-26번지 일원') + ' 입니다.</p></div>';
    return html;
  }

  /* ------------------------------------------------------------ build */
  function build(data) {
    var content = $('#arc-content');
    var tree = $('#arc-nav-tree');
    var status = $('#arc-status');

    var pages = data.pages || [];
    var groupOrder = [];
    var byGroup = {};
    pages.forEach(function (p) {
      if (!byGroup[p.group]) { byGroup[p.group] = []; groupOrder.push(p.group); }
      byGroup[p.group].push(p);
    });

    var images = {};
    var videos = 0;
    pages.forEach(function (p) {
      (p.blocks || []).forEach(function (b) {
        if (b.t === 'img' && b.src) images[b.src] = 1;
        if (b.t === 'tabs') (b.items || []).forEach(function (it) {
          (it.images || []).forEach(function (im) { if (im.src) images[im.src] = 1; });
        });
        if (b.t === 'video') videos += 1;
      });
    });
    (data.mobile && data.mobile.tabs ? data.mobile.tabs : []).forEach(function (t) {
      (t.items || []).forEach(function (it) {
        (it.images || []).forEach(function (im) { if (im.src) images[im.src] = 1; });
      });
    });
    if (data.main) {
      if (data.main.slides) data.main.slides.forEach(function (sl) { if (sl.pc) images[sl.pc] = 1; });
      if (data.main.popups) data.main.popups.forEach(function (pp) { if (pp.src) images[pp.src] = 1; });
    }
    var consPhotos = (data.construction && data.construction.photos) || [];
    consPhotos.forEach(function (p) { if (p.src) images[p.src] = 1; });

    var statPages = document.getElementById('st-pages');
    var statImg = document.getElementById('st-images');
    var statVid = document.getElementById('st-videos');
    var statCons = document.getElementById('st-cons');
    if (statPages) statPages.textContent = pages.length;
    if (statImg) statImg.textContent = Object.keys(images).length;
    if (statVid) statVid.textContent = videos;
    if (statCons) statCons.textContent = (data.construction && data.construction.months ? data.construction.months.length : 0);

    var anchorOf = {};
    groupOrder.forEach(function (g, i) {
      anchorOf[g] = (g === '공사정보') ? 'arc-cons' : 'arc-s' + i;
    });

    var html = '';
    var navHtml = '';
    var secIndex = 0;

    navHtml += '<div class="arc-nav__group"><p>공식 홈페이지</p><a href="#arc-main" data-sec="arc-main">메인 화면</a></div>';
    html += '<section class="arc-sec" id="arc-main" data-group-anchor="arc-main">' +
      '<div class="arc-sec__head"><span class="arc-sec__group">xi.co.kr/dgb</span><h2>공식 홈페이지 메인</h2>' +
      '<a class="arc-sec__src" href="https://xi.co.kr/dgb" target="_blank" rel="noopener">원문 ↗</a></div>' +
      '<div class="arc-sec__body">' + renderMain(data.main) + '</div></section>';

    groupOrder.forEach(function (g) {
      navHtml += '<div class="arc-nav__group"><p>' + esc(g) + '</p>';
      html += '<section class="arc-sec" id="' + anchorOf[g] + '" data-group-anchor="' + esc(anchorOf[g]) + '">' +
        '<div class="arc-sec__head"><span class="arc-sec__group">' + esc(g) + '</span>' +
        '<h2>' + esc(g) + '</h2></div>';
      byGroup[g].forEach(function (p) {
        secIndex += 1;
        var secId = 'arc-p' + secIndex;
        var gid = secId;
        navHtml += '<a href="#' + secId + '" data-sec="' + secId + '">' + esc(p.item) + '</a>';
        html += '<section class="arc-page" id="' + secId + '">' +
          '<div class="arc-sec__head arc-sec__head--sub"><h2>' + esc(p.item) + '</h2>' +
          (p.url ? '<a class="arc-sec__src" href="' + esc(p.url) + '" target="_blank" rel="noopener">원문 ↗</a>' : '') +
          '</div><div class="arc-sec__body">';
        if (p.construction) {
          html += renderConstruction(p.construction);
        } else {
          html += renderBlocks(p.blocks, gid, secId);
        }
        if (!p.construction && (!p.blocks || !p.blocks.length)) {
          html += '<p class="arc-empty">이 메뉴는 원문에서도 별도 내용 없이 연결만 제공합니다.</p>';
        }
        html += '</div></section>';
      });
      html += '</section>';
      navHtml += '</div>';
    });

    // 모바일 단지정보
    navHtml += '<div class="arc-nav__group"><p>자이 단지정보</p><a href="#arc-mobile" data-sec="arc-mobile">m.xi.co.kr 단지정보</a></div>';
    html += '<section class="arc-sec" id="arc-mobile" data-group-anchor="arc-mobile">' +
      '<div class="arc-sec__head"><span class="arc-sec__group">입주단지 상세</span><h2>자이 단지정보 · m.xi.co.kr</h2>' +
      '<a class="arc-sec__src" href="https://m.xi.co.kr/AptComplex/apt_view?aptSeq=467" target="_blank" rel="noopener">원문 ↗</a></div>' +
      '<div class="arc-sec__body">' + renderMobile(data.mobile) + '</div></section>';

    // 수집 정보
    html += '<section class="arc-meta" id="arc-meta">' +
      '<p><b>수집 기준</b> · ' + esc(data.generatedAt || '2026-11-24') + ' · GS건설 자이 공식 홈페이지(xi.co.kr/dgb) 메뉴 ' +
      pages.length + '개 페이지, 자이 단지정보(m.xi.co.kr, aptSeq=467), E-모델하우스 링크.</p>' +
      '<p><b>보존 방식</b> · 원문의 이미지는 모두 내려받아 <code>site/assets/archive/</code> 에 저장했고(외부 핫링크 없음), ' +
      '표·안내문 텍스트는 <code>data/archive.json</code> 에 정리했습니다. 원본이 4,000px에 달하는 월별 공사현장 사진은 보기 좋게 2,600px로 줄여 보존했습니다.</p>' +
      '<p><b>원저작권</b> · 이미지와 문구의 저작권은 GS건설·자이에 있습니다. 이 페이지는 공개된 자료를 보존·인용하는 참고용 기록입니다.</p>' +
      '<div class="arc-top"><a class="arc-btn" href="#main">맨 위로 ↑</a></div>' +
      '</section>';

    if (content) content.innerHTML = html;
    if (tree) tree.innerHTML = navHtml;
    if (status) status.remove();

    // tabs
    $$('.arc-tabwrap', content).forEach(function (wrap) {
      var tabs = $$('[role="tab"]', wrap);
      tabs.forEach(function (tab) {
        tab.addEventListener('click', function () {
          tabs.forEach(function (t) {
            t.setAttribute('aria-selected', t === tab ? 'true' : 'false');
            var panel = document.getElementById(t.getAttribute('aria-controls'));
            if (panel) panel.hidden = (t !== tab);
          });
        });
        tab.addEventListener('keydown', function (e) {
          var i = tabs.indexOf(tab);
          if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
            e.preventDefault();
            var n = tabs[(i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
            n.focus(); n.click();
          }
        });
      });
    });

    // yt facade
    $$('[data-play]', content).forEach(function (btn) {
      btn.addEventListener('click', function () {
        var card = document.getElementById(btn.getAttribute('data-into'));
        if (!card) return;
        var id = btn.getAttribute('data-play');
        var box = document.createElement('div');
        box.className = 'arc-embed';
        box.innerHTML = '<iframe src="https://www.youtube-nocookie.com/embed/' + encodeURIComponent(id) +
          '?autoplay=1&rel=0" title="범어자이 영상" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen loading="lazy"></iframe>';
        card.innerHTML = '';
        card.appendChild(box);
      });
    });

    // scroll spy
    var links = $$('#arc-nav-tree a');
    var targets = links.map(function (a) { return document.getElementById(a.getAttribute('data-sec')); }).filter(Boolean);
    function setCurrent(id) {
      links.forEach(function (a) { a.classList.toggle('is-current', a.getAttribute('data-sec') === id); });
      var cur = links.filter(function (a) { return a.getAttribute('data-sec') === id; })[0];
      if (cur && window.innerWidth <= 900) {
        var navBar = $('#arc-nav');
        if (navBar) {
          var left = cur.offsetLeft - navBar.clientWidth / 2 + cur.clientWidth / 2;
          navBar.scrollTo({ left: left, behavior: 'smooth' });
        }
      }
    }
    if ('IntersectionObserver' in window && targets.length) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { if (en.isIntersecting) setCurrent(en.target.id); });
      }, { rootMargin: '-96px 0px -70% 0px', threshold: 0 });
      targets.forEach(function (t) { io.observe(t); });
    }
  }

  fetch('data/archive.json', { cache: 'no-cache' })
    .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(build)
    .catch(function (err) {
      var status = $('#arc-status');
      if (status) status.textContent = '아카이브 자료를 불러오지 못했습니다. (data/archive.json · ' + err.message + ')';
    });
})();
