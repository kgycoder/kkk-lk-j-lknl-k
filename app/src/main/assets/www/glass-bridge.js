/* ════════════════════════════════════════════════════════════════════
   GLASS BRIDGE  (SYNC ⇄ Native Liquid Glass)
   - Liquid Glass 표면은 Kotlin + Compose Multiplatform + Kyant `backdrop` 이 WebView 위에 직접 그린다.
   - 이 스크립트는 app.js 를 전혀 수정하지 않는 "읽기 전용 미러 + 명령 수신기" 이다.
       DOM → Native : window.GlassBridge.push(JSON)   (위치/텍스트/재생 상태 — CSS px == dp)
       Native → DOM : window.__glassCmd({...})        (탭/입력을 기존 app.js 함수·DOM 이벤트로 전달)
   - app.js 의 재생·검색·플레이리스트 로직, AndroidBridge 통신은 기존과 100% 동일하게 동작한다.
════════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';
    if (!window.GlassBridge) return; // 일반 브라우저: 기존 DOM UI 그대로

    const $ = id => document.getElementById(id);
    const txt = el => (el ? el.textContent.trim() : '');

    /* DOM <input> 들은 로직의 원천으로만 남기고, 실제 타이핑은 네이티브 필드가 담당 (WebView 키보드 중복 방지) */
    ['q-home', 'q-s', 'pl-dialog-input', 'pl-add-modal-inp'].forEach(id => {
        const el = $(id);
        if (el) { el.readOnly = true; el.setAttribute('inputmode', 'none'); el.setAttribute('autocomplete', 'off'); }
    });

    const box = r => ({ x: r.left, y: r.top, w: r.width, h: r.height });

    /** 요소가 화면에 보이고 다른 UI(예: Now Playing)에 가려져 있지 않은지 */
    function exposed(el) {
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) return false;
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        if (cx < 0 || cy < 0 || cx > innerWidth || cy > innerHeight) return false;
        const t = document.elementFromPoint(cx, cy);
        return !!t && (t === el || el.contains(t));
    }

    /** 고정 중앙 정렬 박스: 등장 애니메이션(scale)에 영향받지 않도록 레이아웃 크기 + 중심 좌표 사용 */
    function stableBox(el) {
        const r = el.getBoundingClientRect();
        const w = el.offsetWidth, h = el.offsetHeight;
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        return { x: cx - w / 2, y: cy - h / 2, w: w, h: h };
    }

    function collect() {
        const st = {};

        /* 하단 내비 */
        const nav = $('mob-nav');
        if (nav && exposed(nav)) {
            const btns = Array.from(nav.querySelectorAll('.mn-btn'));
            st.nav = { r: box(nav.getBoundingClientRect()), active: Math.max(0, btns.findIndex(b => b.classList.contains('on'))) };
        }

        /* 검색 캡슐 (현재 활성 뷰) */
        const wrap = document.querySelector('.view.on .mob-srch-wrap');
        if (wrap && exposed(wrap)) {
            const inp = wrap.querySelector('.srch-inp');
            if (inp) {
                st.search = {
                    r: box(wrap.getBoundingClientRect()), id: inp.id, value: inp.value,
                    ph: inp.getAttribute('placeholder') || '', focused: document.activeElement === inp
                };
            }
        }

        /* 미니 플레이어 */
        const bar = $('bar');
        if (bar && !bar.classList.contains('bar-hidden') && exposed(bar)) {
            const art = $('b-art');
            st.bar = {
                r: box(bar.getBoundingClientRect()),
                art: art ? (art.currentSrc || art.getAttribute('src') || '') : '',
                title: txt($('b-title')), ch: txt($('b-ch')),
                playing: /M118 116/.test(($('cb-play') || {}).innerHTML || ''),
                fav: !!($('b-fav') && $('b-fav').classList.contains('on')),
                accent: (typeof _accentColor === 'function' ? _accentColor() : '#fa2d5a'),
                prog: parseFloat(($('bar-prog-fill') || { style: {} }).style.width) || 0
            };
        }

        /* "플레이리스트에 추가" 컨텍스트 메뉴 */
        const ctx = $('pl-ctx-menu');
        if (ctx && ctx.classList.contains('on')) {
            const items = Array.from(document.querySelectorAll('#pl-ctx-list .pl-ctx-item')).map(txt);
            st.ctx = {
                r: { x: ctx.offsetLeft, y: ctx.offsetTop, w: ctx.offsetWidth, h: ctx.offsetHeight },
                title: txt(ctx.querySelector('.pl-ctx-title')), items: items, new: txt(ctx.querySelector('.pl-ctx-new'))
            };
        }

        /* 이름 입력 다이얼로그 */
        if ($('pl-dialog-overlay') && $('pl-dialog-overlay').classList.contains('on')) {
            const d = $('pl-dialog'), inp = $('pl-dialog-input');
            st.dlg = {
                r: stableBox(d), title: txt($('pl-dialog-title')), value: inp.value,
                ph: inp.getAttribute('placeholder') || '', focused: document.activeElement === inp,
                ok: txt(d.querySelector('.pl-dialog-ok')), cancel: txt(d.querySelector('.pl-dialog-cancel'))
            };
        }

        /* 삭제 확인 다이얼로그 */
        if ($('pl-confirm-overlay') && $('pl-confirm-overlay').classList.contains('on')) {
            const d = $('pl-confirm');
            st.cfm = {
                r: stableBox(d), title: txt($('pl-confirm-title')), msg: txt($('pl-confirm-msg')),
                ok: txt(d.querySelector('.pl-dialog-ok')), cancel: txt(d.querySelector('.pl-dialog-cancel'))
            };
        }

        /* 곡 추가 모달 */
        if ($('pl-add-modal-overlay') && $('pl-add-modal-overlay').classList.contains('on')) {
            const m = $('pl-add-modal'), inp = $('pl-add-modal-inp');
            const rows = Array.from(document.querySelectorAll('#pl-add-modal-results .pl-modal-row')).map(r => {
                const img = r.querySelector('img');
                const btn = r.querySelector('.pl-modal-add-btn');
                return {
                    art: img ? (img.currentSrc || img.getAttribute('src') || '') : '',
                    t: txt(r.querySelector('.pl-modal-row-t')), c: txt(r.querySelector('.pl-modal-row-c')),
                    d: txt(r.querySelector('.pl-modal-row-dur')), added: !!(btn && btn.classList.contains('added'))
                };
            });
            const hint = document.querySelector('#pl-add-modal-results .pl-add-modal-hint');
            st.add = {
                r: stableBox(m), title: txt(m.querySelector('.pl-add-modal-title')), value: inp.value,
                ph: inp.getAttribute('placeholder') || '', focused: document.activeElement === inp,
                rows: rows, hint: rows.length ? null : txt(hint)
            };
        }
        return st;
    }

    /* ── 전송 스케줄링: 변경이 있을 때만, 프레임당 최대 1회 ── */
    let raf = 0, burstUntil = 0, last = '';
    function flush() {
        raf = 0;
        let json;
        try { json = JSON.stringify(collect()); } catch (e) { json = last; }
        if (json !== last) { last = json; window.GlassBridge.push(json); }
        if (performance.now() < burstUntil) raf = requestAnimationFrame(flush);
    }
    function schedule() { if (!raf) raf = requestAnimationFrame(flush); }
    function kick(ms) { burstUntil = Math.max(burstUntil, performance.now() + (ms || 700)); schedule(); }

    const RELEVANT = '#mob-nav,#bar,#pl-ctx-menu,#pl-dialog-overlay,#pl-confirm-overlay,#pl-add-modal-overlay,#np,.view,.mob-srch-wrap';
    new MutationObserver(recs => {
        let needKick = false, needFlush = false;
        for (const r of recs) {
            const t = r.target.nodeType === 1 ? r.target : r.target.parentElement;
            if (!t) continue;
            if (t.id === 'bar-prog-fill') { needFlush = true; continue; }
            if (t.closest && t.closest(RELEVANT)) { needKick = true; break; }
        }
        if (needKick) kick(); else if (needFlush) schedule();
    }).observe(document.body, {
        subtree: true, childList: true, characterData: true,
        attributes: true, attributeFilter: ['class', 'style', 'src', 'placeholder']
    });

    ['scroll', 'resize', 'orientationchange'].forEach(e => window.addEventListener(e, () => kick(250), { capture: true, passive: true }));
    ['input', 'focusin', 'focusout', 'transitionend', 'animationend', 'touchend']
        .forEach(e => document.addEventListener(e, () => kick(400), { capture: true, passive: true }));
    setInterval(schedule, 500);   // 안전망 (프로그램적 value 변경 등 이벤트 없는 변화)
    kick(1200);

    /* ── Native → DOM ── */
    function fireKey(el, key) {
        el.dispatchEvent(new KeyboardEvent('keydown', { key: key, bubbles: true, cancelable: true }));
    }
    window.__glassCmd = function (c) {
        try {
            switch (c.t) {
                case 'nav': {
                    const b = document.querySelector('#mob-nav .mn-btn[data-v="' + c.v + '"]');
                    if (b) b.click();
                    break;
                }
                case 'bar': {
                    if (c.a === 'open') openNP();
                    else if (c.a === 'fav') favCur();
                    else if (c.a === 'play') togglePlay();
                    else if (c.a === 'next') nextT();
                    break;
                }
                case 'text': {
                    const el = $(c.id);
                    if (el) { el.value = c.v; el.dispatchEvent(new Event('input', { bubbles: true })); }
                    break;
                }
                case 'focus': {
                    const el = $(c.id);
                    if (!el) break;
                    if (c.on) el.focus({ preventScroll: true }); else el.blur();
                    break;
                }
                case 'enter': {
                    const el = $(c.id);
                    if (el) fireKey(el, 'Enter');
                    break;
                }
                case 'ctx': {
                    if (c.new) { const n = document.querySelector('#pl-ctx-menu .pl-ctx-new'); if (n) n.click(); }
                    else {
                        const items = document.querySelectorAll('#pl-ctx-list .pl-ctx-item');
                        if (items[c.i]) items[c.i].click();
                    }
                    break;
                }
                case 'dlg': if (c.a === 'ok') plDialogConfirm(); else plDialogCancel(); break;
                case 'cfm': if (c.a === 'ok') plConfirmOk(); else plConfirmCancel(); break;
                case 'add': {
                    if (c.a === 'close') plAddModalClose();
                    else if (c.a === 'row') {
                        const rows = document.querySelectorAll('#pl-add-modal-results .pl-modal-row');
                        const b = rows[c.i] && rows[c.i].querySelector('.pl-modal-add-btn');
                        if (b) b.click();
                    }
                    break;
                }
            }
        } catch (e) { /* 명령 실패가 앱 로직을 깨뜨리지 않도록 */ }
        kick(500);
    };
})();
