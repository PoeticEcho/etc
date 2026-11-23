(function () {
  'use strict';

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function fmtDate(d) { return d ? String(d).replace(/-/g, '.') : ''; }

  /* ---------------------------------------------------------------- topbar */
  var topbar = $('#topbar');
  function onScroll() {
    if (!topbar) return;
    topbar.classList.toggle('is-solid', window.scrollY > 40);
  }
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  /* ------------------------------------------------------------ mobile nav */
  var nav = $('#nav');
  var navToggle = $('#nav-toggle');
  var scrim = $('#scrim');

  function setNav(open) {
    if (!nav) return;
    nav.classList.toggle('is-open', open);
    if (navToggle) {
      navToggle.classList.toggle('is-open', open);
      navToggle.setAttribute('aria-expanded', String(open));
      navToggle.setAttribute('aria-label', open ? '메뉴 닫기' : '메뉴 열기');
    }
    if (scrim) scrim.classList.toggle('is-open', open);
    document.body.classList.toggle('is-locked', open);
  }
  if (navToggle) {
    navToggle.addEventListener('click', function () {
      setNav(!nav.classList.contains('is-open'));
    });
  }
  if (scrim) scrim.addEventListener('click', function () { setNav(false); });
  if (nav) {
    $$('a', nav).forEach(function (a) {
      a.addEventListener('click', function () { setNav(false); });
    });
  }

  /* --------------------------------------------------------------- reveal */
  var io = null;
  if ('IntersectionObserver' in window && !reduced) {
    io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in');
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
  }
  function observeReveals(root) {
    $$('.reveal', root || document).forEach(function (node) {
      if (node.classList.contains('is-in')) return;
      if (io) io.observe(node); else node.classList.add('is-in');
    });
  }
  // Safety net: a fast scroll can jump past an element between observer frames,
  // so anything already above the fold line is shown as well.
  function sweepReveals() {
    var limit = window.innerHeight * 0.94;
    $$('.reveal:not(.is-in)').forEach(function (node) {
      if (node.getBoundingClientRect().top < limit) node.classList.add('is-in');
    });
  }
  var sweepQueued = false;
  window.addEventListener('scroll', function () {
    if (sweepQueued) return;
    sweepQueued = true;
    window.requestAnimationFrame(function () { sweepQueued = false; sweepReveals(); });
  }, { passive: true });
  observeReveals();
  sweepReveals();
  window.addEventListener('load', sweepReveals);

  /* -------------------------------------------------------------- countup */
  function countUp(node) {
    var target = parseInt(node.getAttribute('data-count'), 10);
    if (isNaN(target)) return;
    if (reduced) { node.textContent = target.toLocaleString('ko-KR'); return; }
    var start = null, dur = 1500;
    function tick(t) {
      if (start === null) start = t;
      var p = Math.min(1, (t - start) / dur);
      var eased = 1 - Math.pow(1 - p, 3);
      node.textContent = Math.round(target * eased).toLocaleString('ko-KR');
      if (p < 1) window.requestAnimationFrame(tick);
    }
    window.requestAnimationFrame(tick);
  }
  window.setTimeout(function () { $$('[data-count]').forEach(countUp); }, 260);

  /* ----------------------------------------------------------- active nav */
  var navLinks = nav ? $$('a[href^="#"]', nav) : [];
  var sections = navLinks.map(function (a) { return document.getElementById(a.getAttribute('href').slice(1)); }).filter(Boolean);
  if ('IntersectionObserver' in window && sections.length) {
    var navIo = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        navLinks.forEach(function (a) {
          a.classList.toggle('is-active', a.getAttribute('href') === '#' + entry.target.id);
        });
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    sections.forEach(function (s) { navIo.observe(s); });
  }

  /* ----------------------------------------------------------- accordions */
  $$('.acc').forEach(function (acc) {
    $$('.acc__item', acc).forEach(function (item) {
      var head = $('.acc__head', item);
      if (!head) return;
      head.addEventListener('click', function () {
        var willOpen = !item.classList.contains('is-open');
        $$('.acc__item', acc).forEach(function (other) {
          if (other === item) return;
          other.classList.remove('is-open');
          var h = $('.acc__head', other);
          if (h) h.setAttribute('aria-expanded', 'false');
        });
        item.classList.toggle('is-open', willOpen);
        head.setAttribute('aria-expanded', String(willOpen));
      });
    });
  });

  /* --------------------------------------------------------------- dialogs */
  var articleModal = $('#article-modal');
  var lightbox = $('#lightbox');
  var lastFocus = null;

  function openDialog(node) {
    if (!node) return;
    lastFocus = document.activeElement;
    node.classList.add('is-open');
    node.setAttribute('aria-hidden', 'false');
    document.body.classList.add('is-locked');
    var focusable = node.querySelector('.modal__close, .lightbox__close, button');
    if (focusable) focusable.focus({ preventScroll: true });
  }
  function closeDialog(node) {
    if (!node || !node.classList.contains('is-open')) return;
    node.classList.remove('is-open');
    node.setAttribute('aria-hidden', 'true');
    if (!(articleModal && articleModal.classList.contains('is-open')) &&
        !(lightbox && lightbox.classList.contains('is-open'))) {
      document.body.classList.remove('is-locked');
    }
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }
  $$('[data-close]').forEach(function (btn) {
    btn.addEventListener('click', function () { closeDialog(btn.closest('.modal, .lightbox')); });
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      if (nav && nav.classList.contains('is-open')) { setNav(false); return; }
      if (lightbox && lightbox.classList.contains('is-open')) { closeDialog(lightbox); return; }
      if (articleModal && articleModal.classList.contains('is-open')) closeDialog(articleModal);
    }
  });

  /* --------------------------------------------------------------- fetch */
  function loadJSON(path) {
    return fetch(path, { cache: 'no-store' }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status + ' · ' + path);
      return res.json();
    });
  }

  /* -------------------------------------------------------------- articles */
  var ARTICLES = [];

  // 모든 기사에는 사진이 붙습니다. 기사 JSON에 image가 없어도 기본 사진이 나옵니다.
  var FALLBACK_IMG = 'assets/photos/01-hero.jpg';
  var FALLBACK_CAP = '범어자이 주간 조감도 — GS건설 공식 자료';
  var FALLBACK_ALT = '범어자이 네 개의 동과 상가동이 어우러진 단지 전경';

  function articleImage(a) { return (a && a.image) ? a.image : FALLBACK_IMG; }
  function articleCaption(a) {
    if (a && a.image) return a.imageCaption || '';
    return FALLBACK_CAP;
  }
  function articleAlt(a) {
    if (a && a.image) return a.imageAlt || a.imageCaption || a.title || '기사 사진';
    return FALLBACK_ALT;
  }

  function articlesWrap() {
    var wrap = $('#article-modal');
    return wrap;
  }

  function openArticle(article) {
    if (!articleModal) return;
    $('#article-cat').textContent = article.category || '';
    $('#article-date').textContent = fmtDate(article.date);
    $('#article-title').textContent = article.title || '';
    $('#article-sub').textContent = article.subtitle || '';

    // 기사 전문 상단의 사진 — 누르면 원본 크기로 열립니다.
    var shot = $('#article-photo');
    var shotImg = $('#article-photo-img');
    var shotCap = $('#article-photo-cap');
    if (shot && shotImg) {
      shotImg.src = articleImage(article);
      shotImg.alt = articleAlt(article);
      shotImg.style.objectPosition = article.imagePosition || '50% 50%';
      shot.dataset.zoom = articleImage(article);
      shot.dataset.cap = [articleCaption(article), '범어자이'].filter(Boolean).join(' · ');
      shot.setAttribute('aria-label', (articleAlt(article)) + ' 크게 보기');
      if (shotCap) {
        shotCap.textContent = articleCaption(article);
        shotCap.hidden = !articleCaption(article);
      }
    }

    var body = $('#article-body');
    body.innerHTML = '';
    (article.body || []).forEach(function (block) {
      var type = block.type || 'p';
      var node = document.createElement(type === 'h' ? 'h3' : 'p');
      if (type === 'lead') node.className = 'lead';
      if (type === 'quote') node.className = 'quote';
      node.textContent = block.text || '';
      body.appendChild(node);
    });

    var srcBox = $('#article-sources');
    srcBox.innerHTML = '';
    if (article.sources && article.sources.length) {
      srcBox.appendChild(el('h4', null, '근거 자료'));
      var ul = el('ul');
      article.sources.forEach(function (s) { ul.appendChild(el('li', null, s)); });
      srcBox.appendChild(ul);
    }
    $('#article-source').textContent = article.source || '범어자이 홍보자료';
    openDialog(articleModal);
    articleModal.querySelector('.modal__sheet').scrollTop = 0;
  }

  function buildNewsCard(article, isLead) {
    var card = document.createElement('button');
    card.type = 'button';
    card.className = 'news__card' + (isLead ? ' news__card--lead' : '');

    // 기사 카드에도 사진을 항상 붙입니다(없으면 기본 사진).
    var thumb = el('span', 'news__thumb');
    var thumbImg = document.createElement('img');
    thumbImg.src = articleImage(article);
    thumbImg.alt = articleAlt(article);
    thumbImg.loading = 'lazy';
    thumbImg.decoding = 'async';
    thumbImg.style.objectPosition = article.imagePosition || '50% 50%';
    thumb.appendChild(thumbImg);
    card.appendChild(thumb);

    if (isLead) {
      var kicker = el('p', 'news__lead-kicker', 'COVER STORY · 주간 범어자이');
      card.appendChild(kicker);
    }
    var meta = el('p', 'news__meta');
    meta.appendChild(el('span', 'news__cat', article.category || '소식'));
    meta.appendChild(el('span', null, fmtDate(article.date)));
    card.appendChild(meta);

    card.appendChild(el('h3', null, article.title || ''));
    if (article.excerpt) card.appendChild(el('p', 'news__excerpt', article.excerpt));

    var more = el('span', 'news__more');
    more.appendChild(document.createTextNode('기사 읽기'));
    more.appendChild(el('i'));
    card.appendChild(more);

    card.addEventListener('click', function () { openArticle(article); });
    return card;
  }

  function initNews() {
    var grid = $('#news-grid');
    var fallback = $('#news-fallback');
    if (!grid) return;
    loadJSON('data/articles.json').then(function (data) {
      ARTICLES = (data.articles || []).slice().sort(function (a, b) {
        return String(b.date || '').localeCompare(String(a.date || ''));
      });
      if (!ARTICLES.length) throw new Error('empty');
      grid.innerHTML = '';
      ARTICLES.forEach(function (article, i) {
        grid.appendChild(buildNewsCard(article, i === 0));
      });

      var latest = ARTICLES[0].date;
      var issueLine = $('#issue-line');
      if (issueLine) {
        $('#issue-date').textContent = fmtDate(latest) + ' 발행';
        $('#issue-count').textContent = '기사 ' + ARTICLES.length + '편';
        issueLine.hidden = false;
      }
    }).catch(function (err) {
      grid.innerHTML = '';
      if (fallback) {
        fallback.hidden = false;
        fallback.textContent = '소식 목록을 불러오지 못했습니다. (' + err.message + ') 파일을 서버로 열었는지, data/articles.json 형식이 맞는지 확인해 주세요.';
      }
    });
  }

  /* --------------------------------------------------------------- gallery */
  function initGallery() {
    var wrap = $('#gallery');
    var tabs = $('#gallery-tabs');
    if (!wrap) return;

    loadJSON('data/gallery.json').then(function (data) {
      var items = data.items || [];
      var filters = data.filters || [{ key: 'all', label: '전체' }];

      filters.forEach(function (f, i) {
        var b = document.createElement('button');
        b.type = 'button';
        b.textContent = f.label;
        b.setAttribute('role', 'tab');
        b.setAttribute('aria-selected', i === 0 ? 'true' : 'false');
        b.dataset.filter = f.key;
        if (i === 0) b.classList.add('is-active');
        tabs.appendChild(b);
      });

      items.forEach(function (item) {
        var card = el('article', 'gallery__item reveal is-in');
        var tags = (item.tags && item.tags.length) ? item.tags.slice() : (item.tag ? [item.tag] : []);
        card.dataset.tag = tags[0] || '';
        card.dataset.tags = tags.join(' ');

        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'gallery__btn';
        btn.dataset.zoom = item.src;
        btn.dataset.group = 'views';
        btn.dataset.cap = [item.label, item.credit, item.date].filter(Boolean).join(' · ');
        if (item.creditUrl) btn.dataset.href = item.creditUrl;
        btn.setAttribute('aria-label', (item.label || '사진') + ' 크게 보기');

        var img = document.createElement('img');
        img.src = item.src;
        img.alt = item.alt || item.label || '';
        img.loading = 'lazy';
        btn.appendChild(img);
        card.appendChild(btn);

        var cap = el('div', 'gallery__cap');
        cap.appendChild(el('b', null, item.label));
        if (item.desc) cap.appendChild(el('p', null, item.desc));
        if (item.credit) {
          if (item.creditUrl) {
            var credit = document.createElement('a');
            credit.className = 'gallery__credit';
            credit.href = item.creditUrl;
            credit.target = '_blank';
            credit.rel = 'noopener';
            credit.textContent = item.credit + ' 원문';
            credit.setAttribute('aria-label', item.credit + ' 원문 게시글 열기');
            cap.appendChild(credit);
          } else {
            cap.appendChild(el('span', 'gallery__credit gallery__credit--plain', item.credit));
          }
        }
        card.appendChild(cap);
        wrap.appendChild(card);
      });

      tabs.addEventListener('click', function (e) {
        var btn = e.target.closest('button[data-filter]');
        if (!btn) return;
        var key = btn.dataset.filter;
        $$('button', tabs).forEach(function (b) {
          var on = b === btn;
          b.classList.toggle('is-active', on);
          b.setAttribute('aria-selected', String(on));
        });
        $$('.gallery__item', wrap).forEach(function (item) {
          var itemTags = (item.dataset.tags || '').split(' ');
          item.classList.toggle('is-hidden', !(key === 'all' || itemTags.indexOf(key) !== -1));
        });
      });
    }).catch(function (err) {
      wrap.innerHTML = '';
      wrap.appendChild(el('p', 'loading', '뷰 사진을 불러오지 못했습니다. (' + err.message + ')'));
    });
  }

  /* ------------------------------------------------------------ floor plan */
  function initPlans() {
    var tabs = $('#plan-tabs');
    var panel = $('#plan-panel');
    var notices = $('#plan-notices');
    var tbody = $('#plan-table-body');
    if (!tabs || !panel) return;

    loadJSON('data/floorplans.json').then(function (data) {
      var types = data.types || [];
      if (!types.length) throw new Error('empty');

      function label(t) {
        return t.id.indexOf('84O') === 0 ? 'O' + t.id.slice(3) : t.id;
      }

      types.forEach(function (t, i) {
        if (i > 0 && label(t).charAt(0) === 'O' && label(types[i - 1]).charAt(0) !== 'O') {
          tabs.appendChild(el('span', 'tabs__sep'));
        }
        var b = document.createElement('button');
        b.type = 'button';
        b.textContent = label(t);
        b.setAttribute('role', 'tab');
        b.setAttribute('aria-selected', i === 0 ? 'true' : 'false');
        b.dataset.type = t.id;
        if (i === 0) b.classList.add('is-active');
        b.addEventListener('click', function () {
          $$('button', tabs).forEach(function (o) {
            var on = o === b;
            o.classList.toggle('is-active', on);
            o.setAttribute('aria-selected', String(on));
          });
          render(t);
        });
        tabs.appendChild(b);
      });

      function render(t) {
        var specs = [
          ['전용면적', t.exclusive],
          ['공급면적', t.supply],
          ['계약면적', t.contract],
          ['분양가 (2022)', t.price]
        ].filter(function (row) { return row[1] && row[1] !== '—'; });

        panel.innerHTML =
          '<div class="plan__info">' +
            '<p class="plan__name">' + esc(t.name) + '</p>' +
            '<p class="plan__units">' + esc(t.units) + '세대 · 전용 ' + esc(t.exclusive) + '</p>' +
            '<div class="plan__shape">' +
              '<span>' + esc(t.shape) + '</span>' +
              (t.bay && t.bay !== '—' ? '<span>' + esc(t.bay) + '</span>' : '') +
            '</div>' +
            '<dl class="plan__spec">' +
              specs.map(function (row) {
                return '<div><dt>' + esc(row[0]) + '</dt><dd>' + esc(row[1]) + '</dd></div>';
              }).join('') +
            '</dl>' +
            '<ul class="plan__features">' +
              (t.features || []).map(function (f) { return '<li>' + esc(f) + '</li>'; }).join('') +
            '</ul>' +
            (t.note ? '<p class="plan__note">' + esc(t.note) + '</p>' : '') +
          '</div>' +
          '<button class="plan__figure" type="button" data-zoom="' + esc(t.img) + '" data-cap="' + esc(t.name + ' 평면도 · GS건설 자이 공식 평형정보') + '" aria-label="' + esc(t.name) + ' 평면도 크게 보기">' +
            '<img src="' + esc(t.img) + '" alt="' + esc(t.name) + ' 평면도. 기본형과 확장형 도면" loading="lazy" />' +
            '<span>전체 평면도 보기</span>' +
          '</button>';
      }

      render(types[0]);

      if (notices && data.notices) {
        notices.innerHTML = data.notices.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('');
      }

      if (tbody) {
        tbody.innerHTML = types.filter(function (t) { return label(t).charAt(0) !== 'O'; }).map(function (t) {
          return '<tr>' +
            '<td>' + esc(t.name) + '</td>' +
            '<td>' + esc(t.units) + '세대</td>' +
            '<td>' + esc(t.exclusive) + '</td>' +
            '<td>' + esc(t.supply) + '</td>' +
            '<td>' + esc(t.price) + '</td>' +
          '</tr>';
        }).join('');
      }
    }).catch(function (err) {
      panel.innerHTML = '<p class="loading">평면도 정보를 불러오지 못했습니다. (' + esc(err.message) + ')</p>';
    });
  }

  /* ------------------------------------------------------------- lightbox */
  var lbList = [];
  var lbIndex = 0;

  function renderLightbox() {
    var btn = lbList[lbIndex];
    if (!btn) return;
    $('#lightbox-img').src = btn.dataset.zoom;
    $('#lightbox-img').alt = btn.dataset.cap || '사진';
    $('#lightbox-cap').textContent = btn.dataset.cap || '';
    var credit = $('#lightbox-credit');
    if (btn.dataset.href) {
      credit.href = btn.dataset.href;
      credit.textContent = '원문 보기 ↗';
      credit.hidden = false;
    } else {
      credit.removeAttribute('href');
      credit.textContent = '';
      credit.hidden = true;
    }
    lightbox.classList.toggle('is-single', lbList.length < 2);
  }

  function openLightbox(btn) {
    var group = btn.dataset.group;
    if (group) {
      lbList = $$('[data-group="' + group + '"]').filter(function (b) {
        return !b.closest('.is-hidden');
      });
    } else {
      lbList = [btn];
    }
    lbIndex = Math.max(0, lbList.indexOf(btn));
    renderLightbox();
    openDialog(lightbox);
  }
  function stepLightbox(dir) {
    if (lbList.length < 2) return;
    lbIndex = (lbIndex + dir + lbList.length) % lbList.length;
    renderLightbox();
  }

  document.addEventListener('click', function (e) {
    var trigger = e.target.closest('[data-zoom]');
    if (!trigger) return;
    e.preventDefault();
    openLightbox(trigger);
  });
  var prevBtn = $('#lb-prev');
  var nextBtn = $('#lb-next');
  if (prevBtn) prevBtn.addEventListener('click', function () { stepLightbox(-1); });
  if (nextBtn) nextBtn.addEventListener('click', function () { stepLightbox(1); });
  document.addEventListener('keydown', function (e) {
    if (!lightbox || !lightbox.classList.contains('is-open')) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); stepLightbox(-1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); stepLightbox(1); }
  });

  /* ------------------------------------------------------- section folding */
  var FOLD_KEY = 'beomeo_collapsed_sections';
  var foldables = $$('.sec-fold[data-fold]').map(function (btn) {
    var id = btn.getAttribute('data-fold');
    var sec = document.getElementById(id);
    var body = sec ? $('.sec-body', sec) : null;
    var h = sec ? $('h2', sec) : null;
    return {
      id: id,
      sec: sec,
      body: body,
      inner: body ? $('.sec-body__inner', body) : null,
      btn: btn,
      txt: $('.sec-fold__txt', btn),
      name: h ? (h.innerText || h.textContent || '').replace(/\s+/g, ' ').trim() : id
    };
  }).filter(function (f) { return !!f.sec; });

  var revisitToggle = $('#revisit-toggle');
  var revisitState = $('#revisit-state');
  var newsSection = $('#news');

  function readCollapsed() {
    try {
      var raw = window.localStorage.getItem(FOLD_KEY);
      var list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch (e) { return []; }
  }
  function saveCollapsed() {
    var list = foldables.filter(function (f) {
      return f.sec.classList.contains('is-collapsed');
    }).map(function (f) { return f.id; });
    try { window.localStorage.setItem(FOLD_KEY, JSON.stringify(list)); } catch (e) {}
    syncRevisit();
  }
  function isCollapsed(item) { return item.sec.classList.contains('is-collapsed'); }
  function setFold(item, on, opts) {
    opts = opts || {};
    if (!item || isCollapsed(item) === on) return;
    item.sec.classList.toggle('is-collapsed', on);
    item.btn.setAttribute('aria-expanded', String(!on));
    item.btn.setAttribute('aria-label', item.name + ' ' + (on ? '펼치기' : '접기'));
    if (item.txt) item.txt.textContent = on ? '펼치기' : '접기';
    if (item.inner) {
      if (on) {
        item.inner.setAttribute('inert', '');
        item.inner.setAttribute('aria-hidden', 'true');
      } else {
        item.inner.removeAttribute('inert');
        item.inner.removeAttribute('aria-hidden');
      }
    }
    if (on && item.inner && item.inner.contains(document.activeElement)) {
      item.btn.focus({ preventScroll: true });
    }
    if (opts.save !== false) saveCollapsed();
  }
  function allCollapsed() {
    return foldables.length > 0 && foldables.every(isCollapsed);
  }
  function syncRevisit() {
    var on = allCollapsed();
    if (revisitToggle) revisitToggle.setAttribute('aria-checked', String(on));
    if (revisitState) revisitState.textContent = on ? '켜짐' : '꺼짐';
  }

  // restore saved state
  var savedCollapsed = readCollapsed();
  foldables.forEach(function (f) {
    if (savedCollapsed.indexOf(f.id) !== -1) setFold(f, true, { save: false });
  });
  foldables.forEach(function (f) {
    f.btn.setAttribute('aria-label', f.name + (isCollapsed(f) ? ' 펼치기' : ' 접기'));
  });
  syncRevisit();

  foldables.forEach(function (f) {
    f.btn.addEventListener('click', function () {
      var willCollapse = !isCollapsed(f);
      setFold(f, willCollapse);
      // 내용이 맨 위보다 위에서 접히면 시선을 헤더로 올려 둡니다.
      if (willCollapse) {
        var top = f.sec.getBoundingClientRect().top;
        if (top < 0) {
          window.scrollTo({ top: window.pageYOffset + top - 12, behavior: reduced ? 'auto' : 'smooth' });
        }
      }
    });
  });

  if (revisitToggle) {
    revisitToggle.addEventListener('click', function () {
      var turnOn = !allCollapsed();
      foldables.forEach(function (f) { setFold(f, turnOn, { save: false }); });
      saveCollapsed();
      if (turnOn && newsSection) {
        // 접기 애니메이션이 끝난 뒤 최종 위치로 시선을 옮깁니다.
        window.setTimeout(function () {
          var top = newsSection.getBoundingClientRect().top + window.pageYOffset - 72;
          if (window.pageYOffset > top + 4) window.scrollTo({ top: top, behavior: reduced ? 'auto' : 'smooth' });
        }, 640);
      }
    });
  }

  // 안내 링크로 접힌 섹션을 찾아가면 그 섹션은 펼쳐 둡니다.
  $$('a[href^="#"]').forEach(function (a) {
    a.addEventListener('click', function () {
      var id = a.getAttribute('href').slice(1);
      if (!id) return;
      var target = foldables.filter(function (f) { return f.id === id; })[0];
      if (target && isCollapsed(target)) {
        setFold(target, false);
        window.setTimeout(function () {
          var el2 = document.getElementById(id);
          if (el2) el2.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
        }, 620);
      }
    });
  });

  // 주소에 붙은 해시가 접힌 섹션이면 열고 보여줍니다.
  if (location.hash) {
    var hashId = location.hash.slice(1);
    var hashTarget = foldables.filter(function (f) { return f.id === hashId; })[0];
    if (hashTarget && isCollapsed(hashTarget)) setFold(hashTarget, false);
  }

  /* --------------------------------------------------------- footer actions */
  var toastNode = $('#toast');
  var toastTimer = null;
  function toast(msg) {
    if (!toastNode) return;
    toastNode.textContent = msg;
    toastNode.classList.add('is-on');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () { toastNode.classList.remove('is-on'); }, 3200);
  }

  var toTop = $('#to-top');
  if (toTop) {
    toTop.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
      var brand = $('.brand');
      if (brand) window.setTimeout(function () { brand.focus({ preventScroll: true }); }, reduced ? 0 : 520);
    });
  }

  var favModal = $('#fav-modal');
  var favAdd = $('#fav-add');
  var favShare = $('#fav-share');
  var favCopy = $('#fav-copy');
  var uaStr = navigator.userAgent || '';
  var isTouchPad = /iPhone|iPad|iPod/.test(uaStr);
  var isMac = !isTouchPad && (/Macintosh|Mac OS X/.test(uaStr) || /Mac/.test(navigator.platform || ''));
  if (isMac) { var kbd = $('#fav-kbd'); if (kbd) kbd.textContent = '⌘'; }
  if (favShare && navigator.share) favShare.hidden = false;

  if (favAdd && favModal) {
    favAdd.addEventListener('click', function () { openDialog(favModal); });
  }
  if (favShare) {
    favShare.addEventListener('click', function () {
      navigator.share({ title: document.title, text: '범어자이 — 동쪽엔 숲, 서쪽엔 도심', url: location.href.split('#')[0] })
        .catch(function () {});
    });
  }
  function copyPageUrl() {
    var url = location.href.split('#')[0];
    function done() { toast('링크를 복사했습니다. 주소창에 붙여 넣으면 바로 열립니다.'); }
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = url;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.top = '-1000px';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); done(); }
      catch (e) { toast('복사가 막혔습니다. 주소창의 주소를 직접 복사해 주세요.'); }
      document.body.removeChild(ta);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(done, fallback);
    } else {
      fallback();
    }
  }
  if (favCopy) favCopy.addEventListener('click', copyPageUrl);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && favModal && favModal.classList.contains('is-open')) closeDialog(favModal);
  });

  /* ------------------------------------------------------------------ boot */
  initNews();
  initGallery();
  initPlans();
})();
