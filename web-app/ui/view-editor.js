/**
 * Test item editor, rendered entirely from the catalog: adding a module to the catalog
 * needs no change here.
 *
 * No jsdom, so this file has no automated tests. All logic lives in messages.js / item-edit.js.
 */

import { DIMENSIONS, MODULES } from '../engine/catalog.js';
import { parseCapture } from '../engine/capture-parser.js';
import { readDroppedFile } from './file-handle.js';
import { validateItem, DIMENSION_LABELS } from './messages.js';
import {
  setDimension, allowedChecksFor, portFieldsFor,
  CONVERGENCE_CFG_KEYS, cfgPlaceholder,
} from './item-edit.js';
import { portKey } from './project.js';
import { listbox } from './view-listbox.js';
import { toggle } from './view-toggle.js';

/**
 * Module parameters tucked under "Advanced": rate details that usually need no changes.
 *
 * loading is additionally hidden altogether (see render): resolveLoading() always lets
 * target_now override the spec value, so under the convergence shape the field has no
 * effect. learning_loading is the opposite (the spec value wins and target_now is only a
 * fallback), so it stays visible.
 */
const ADVANCED_PARAMS = new Set(['loading', 'learning_loading']);

/** Rarely used settings are tucked under "Advanced", not hidden away. */
const SECTIONS = [
  {
    key: 'basic', title: '基本資料',
    cfg: [
      ['framesize_custom', 'Frame size(逗號分隔)'],
      ['tx_duration_time', '送包秒數'],
    ],
    advanced: [],
  },
  {
    key: 'wiring', title: '封包與連接',
    cfg: [],
    advanced: [
      ['learning_frames', '學習封包數'],
      ['learning_gap_seconds', '學習間距(秒)'],
      ['learning_settle_time', '學習安頓時間(秒)'],
      ['counter_settle_time', '計數器安頓時間(秒)'],
      ['counter_read_wait', '計數器讀取等待(秒)'],
      ['aging_time', '老化時間(秒)'],
    ],
  },
  {
    key: 'verdict', title: '判定邏輯',
    cfg: [
      ['target_min', '收斂下限'],
      ['target_now', '收斂初始值'],
      ['target_max', '收斂上限'],
      ['target_resolution', '收斂解析度'],
    ],
    advanced: [
      ['mode_convergence', '收斂模式(0=二分 1=線性)'],
      ['target_step', '線性步長'],
      ['target_acceptloss', '可接受損失率(%)'],
    ],
  },
];

function section(title) {
  const box = document.createElement('section');
  box.className = 'edit-section';
  const h = document.createElement('h4');
  h.textContent = title;
  box.append(h);
  return box;
}

function field(label, node, note = null) {
  // The wrapper is a <label> by default, so clicking the text focuses/toggles the single
  // control inside (inputs, dropdowns and single toggles all work this way). But the mesh
  // port picker (portControl()'s isMesh branch) contains several independent
  // <label class="port-line"> elements. Nested <label>s are invalid HTML and browsers do
  // not define the outer label's hit area: hovering any later toggle still counts as the
  // whole row, so the browser applies hover to the first labelable element inside (the
  // first toggle), which lights up while the pointer is nowhere near it. If node already
  // contains its own <label>, the wrapper becomes a <div> instead, so no labels are
  // nested and the problem never occurs.
  const hasNestedLabel = node.querySelector?.('label') != null;
  const wrap = document.createElement(hasNestedLabel ? 'div' : 'label');
  wrap.className = 'field';
  const t = document.createElement('span');
  t.textContent = label;
  wrap.append(t, node);
  if (!note) return wrap;

  // the hint is written out in grey rather than put in title; a tooltip that needs hovering is as good as unsaid
  const box = document.createElement('div');
  box.className = 'field-with-note';
  const hint = document.createElement('div');
  hint.className = 'note';
  hint.textContent = note;
  box.append(wrap, hint);
  return box;
}

function paramInput(spec, value, onChange) {
  if (spec.type === 'bool') {
    return toggle(Boolean(value), onChange);
  }
  if (spec.type === 'enum') {
    return listbox(spec.options.map(o => [o, o]), value, onChange);
  }
  if (spec.type === 'multi-enum') {
    const el = document.createElement('input');
    el.value = (value ?? []).join(',');
    el.onchange = () => onChange(el.value.split(',').map(s => s.trim()).filter(Boolean));
    return el;
  }
  const el = document.createElement('input');
  el.type = 'text';
  el.value = value ?? '';
  el.onchange = () => {
    const raw = el.value.trim();
    onChange(raw === '' ? null : Number(raw));
  };
  return el;
}

/**
 * Port input.
 *
 * With a lease only leased ports can be picked: a typo or an unleased port would fail only
 * at run time, after waiting through the whole learning and sending process. Simulation
 * mode has no lease and keeps free input.
 */
function portControl(fieldName, item, leased, onChange) {
  const isMesh = fieldName.startsWith('mesh');
  const cur = item.ports?.[fieldName];

  if (leased.length === 0) {
    const input = document.createElement('input');
    input.type = 'text';
    input.value = Array.isArray(cur?.[0])
      ? cur.map(p => p.join('/')).join(' ')
      : (cur ?? []).join('/');
    input.placeholder = isMesh ? '0/7/1 0/7/2 0/7/3' : '0/7/1';
    input.onchange = () => {
      const groups = input.value.trim().split(/\s+/).filter(Boolean)
        .map(g => g.split('/').map(Number));
      onChange(isMesh ? groups : groups[0]);
    };
    return input;
  }

  if (isMesh) {
    const box = document.createElement('span');
    const chosen = new Set((cur ?? []).map(portKey));
    for (const p of leased) {
      const label = document.createElement('label');
      label.className = 'port-line';
      const sw = toggle(chosen.has(portKey(p)), checkedNow => {
        if (checkedNow) chosen.add(portKey(p));
        else chosen.delete(portKey(p));
        // output in lease order, not click order; the order of clicks must not turn the same ports into a different setting
        onChange(leased.filter(x => chosen.has(portKey(x))));
      });
      label.append(sw, ` ${portKey(p)}`);
      box.append(label);
    }
    return box;
  }

  const opts = [['', '(未指定)'], ...leased.map(p => [portKey(p), portKey(p)])];
  return listbox(opts, cur ? portKey(cur) : '',
    v => onChange(v === '' ? null : v.split('/').map(Number)));
}

/** Extension list shared by the file picker and <input accept>. */
const CAPTURE_EXTENSIONS = ['.pcap', '.pcapng', '.cap'];

/**
 * The "Import PCAP / PCAPNG" button, plus a drop zone.
 *
 * Same "File System Access API first, <input type=file> fallback" pattern as
 * ui/file-handle.js, but without reusing its openProjectFile(): that function always
 * reads a plain-text .xmnt project (getFile().text()), whereas this reads the binary
 * content of any capture file (.arrayBuffer()), a different file type. Dropping reuses
 * readDroppedFile() from there directly, since it does not care about extensions.
 *
 * onImported(parsed) is called only after a successful parse, with parsed shaped like
 * { packets: [...], fileName: 'capture.pcapng' }.
 */
function pcapImportField(item, onImported) {
  const box = document.createElement('div');
  box.className = 'field-with-note';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'pcap-import';   // locked together with the other controls while running; see the end of render
  const existing = item.params?.stream?.pcap_file;
  btn.textContent = existing
    ? `重新導入(目前:${existing.fileName} · ${existing.packets.length} 筆封包)`
    : '導入 PCAP / PCAPNG';

  const err = document.createElement('div');
  err.className = 'validate blocked';
  err.hidden = true;

  const handleFile = async file => {
    err.hidden = true;
    try {
      const { packets } = parseCapture(await file.arrayBuffer());
      onImported({ packets, fileName: file.name });
    } catch (e) {
      // a parse failure must say why (wrong format, truncated, not Ethernet, a packet over
      // 1024 bytes) instead of failing silently or importing half the data
      err.textContent = String(e?.message ?? e);
      err.hidden = false;
    }
  };

  if (typeof window !== 'undefined' && typeof window.showOpenFilePicker === 'function') {
    btn.onclick = async () => {
      let handles;
      try {
        handles = await window.showOpenFilePicker({
          multiple: false,
          types: [{
            description: '封包擷取檔(PCAP / PCAPNG)',
            accept: { 'application/octet-stream': CAPTURE_EXTENSIONS },
          }],
        });
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return;  // user cancelled
        throw e;
      }
      await handleFile(await handles[0].getFile());
    };
  } else {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = CAPTURE_EXTENSIONS.join(',');
    input.hidden = true;
    input.onchange = () => { if (input.files[0]) handleFile(input.files[0]); };
    btn.onclick = () => input.click();
    box.append(input);
  }

  // Drop zone, styled and behaving like the home page's .dropzone (ui/view-home.js), except
  // that its width follows the field; the home page one is centered at a fixed width.
  const drop = document.createElement('div');
  drop.className = 'dropzone pcap-dropzone';
  drop.textContent = '或把 .pcap / .pcapng 檔案拖曳到這裡';
  drop.ondragover = ev => { ev.preventDefault(); drop.classList.add('over'); };
  drop.ondragleave = () => drop.classList.remove('over');
  drop.ondrop = async ev => {
    ev.preventDefault();
    drop.classList.remove('over');
    // getAsFileSystemHandle() must be called synchronously in the event handler, so this
    // step comes before any await; readDroppedFile already takes care of that
    const dropped = await readDroppedFile(ev.dataTransfer);
    if (dropped !== null) await handleFile(dropped.file);
  };

  box.append(btn, drop, err);
  return box;
}

export function mountEditor(el, store, { onSave }) {
  let draft = null;
  const leasedPorts = () => store.getState().project?.ports ?? [];

  const close = () => { draft = null; el.close(); };
  const isRunningId = (state, id) => state.queue.some(q => q.itemId === id && q.status === 'running');

  // Close when the item being edited is deleted; otherwise the editor would sit on
  // something that no longer exists, and "Save" would bring it back.
  //
  // Redraw when the run state changes: if "Run" is pressed elsewhere while the editor is
  // open, the fields must lock immediately rather than after a close and reopen. Compare
  // before/after instead of redrawing on every dispatch (progress bar and per-round log
  // updates): those do not affect isRunning, and redrawing would wipe half-typed input and
  // jolt the scroll position.
  let wasRunning = false;
  store.subscribe(state => {
    if (!draft) return;
    if (!state.items.some(i => i.id === draft.id)) { close(); return; }
    const running = isRunningId(state, draft.id);
    if (running !== wasRunning) { wasRunning = running; render(); }
  });

  function render() {
    el.replaceChildren();
    if (!draft) return;

    // Port and parameter changes also affect validation (aggregate / use_stream_counters
    // have block rules), but a full redraw would steal focus and scroll position, so only the
    // hints and "Save" are updated in place. Declared here so the onChange closures below can
    // capture it; the real content is installed at the end of render.
    let revalidate = () => {};

    // Keep the subscribe comparison baseline above in sync: render() is also called directly
    // by user interaction (changing a dimension or the verdict shape), not only via subscribe.
    const isRunning = isRunningId(store.getState(), draft.id);
    wasRunning = isRunning;

    const showsConvergence = draft.shape.kind === 'convergence';
    const visible = ([k]) => {
      // For pure send, each PCAP packet carries its own size, which is not a sweepable
      // dimension; showing this field would only suggest it can be changed
      if (draft.shape.kind === 'pure_send' && k === 'framesize_custom') return false;
      return showsConvergence || !CONVERGENCE_CFG_KEYS.includes(k);
    };
    const basic = section('基本資料');
    const wiring = section('封包與連接');
    const verdict = section('判定邏輯');

    const nameInput = document.createElement('input');
    nameInput.value = draft.name;
    const nameWarning = document.createElement('div');
    nameWarning.className = 'note';
    // Update live with oninput (not onchange), deliberately without calling render(): this
    // form's render() redraws everything (el.replaceChildren()), and a redraw mid-typing
    // would blur the input and lose the cursor position. Only this hint text is updated,
    // leaving the other fields alone.
    const updateNameWarning = () => {
      const hasNonLatin1 = [...nameInput.value].some(ch => ch.codePointAt(0) > 0xFF);
      nameWarning.textContent = hasNonLatin1
        ? '⚠ 名稱含有中文或其他特殊字元——PDF 匯出目前只支援 Latin-1'
          + '(英文/數字/常見符號),含這些字元的名稱在 PDF 報告裡會匯出失敗。'
          + '若要匯出 PDF,建議把測試項名稱改成英文。'
        : '';
    };
    updateNameWarning();
    nameInput.oninput = () => {
      draft = { ...draft, name: nameInput.value };
      updateNameWarning();
    };
    basic.append(field('名稱', nameInput), nameWarning);

    // --- the five dimensions ---
    // Custom packets serve a single purpose (just monitoring the send), and setDimension
    // locks the other four dimensions to fixed values. They are not rendered at all rather
    // than shown disabled: the user has nothing to do with them, and a row of greyed-out
    // menus would just be noise.
    const isCustom = draft.recipe.stream === 'Custom';
    const lockedDims = new Set(isCustom ? ['topology', 'trigger', 'reader'] : []);

    for (const d of DIMENSIONS) {
      if (!lockedDims.has(d)) {
        const opts = [['', '(未選)'], ...Object.entries(MODULES[d]).map(([k, m]) => [k, m.label])];
        const cur = Array.isArray(draft.recipe[d]) ? draft.recipe[d][0] : (draft.recipe[d] ?? '');
        wiring.append(field(DIMENSION_LABELS[d], listbox(opts, cur, v => {
          draft = setDimension(draft, d, v || null);
          render();
        })));
      }

      // The import button must sit right below the Stream menu. The per-dimension parameter
      // loop below runs after all five menus are rendered, so going through it would put
      // the Reader menu and other things in between.
      if (d === 'stream' && isCustom) {
        wiring.append(pcapImportField(draft, parsed => {
          draft = { ...draft, params: { ...draft.params,
            stream: { ...draft.params.stream, pcap_file: parsed } } };
          render();
        }));
      }
    }

    // --- per-dimension parameters, rendered straight from the schema; rate settings go under "Advanced" ---
    const advancedParamFields = [];
    for (const d of DIMENSIONS) {
      // Locked dimensions don't render their parameters either: with the menu hidden, a row
      // of adjustable knobs would tell the user "this Reader can be tuned" when it is locked
      if (lockedDims.has(d)) continue;

      const name = draft.recipe[d];
      const names = Array.isArray(name) ? name : [name];
      for (const n of names) {
        for (const [k, spec] of Object.entries(MODULES[d]?.[n]?.params ?? {})) {
          // under the convergence shape loading has no effect; resolveLoading() always uses target_now
          if (k === 'loading' && showsConvergence) continue;

          const label = `${k}${spec.unit ? `(${spec.unit})` : ''}`;
          const input = paramInput(spec, draft.params[d]?.[k], v => {
            draft = { ...draft, params: { ...draft.params,
              [d]: { ...draft.params[d], [k]: v } } };
            revalidate();
          });
          if (spec.default == null && input.tagName === 'INPUT' && spec.nullable) {
            input.placeholder = '(不設定)';
          }
          const f = field(label, input, spec.note);
          if (ADVANCED_PARAMS.has(k)) advancedParamFields.push(f);
          else wiring.append(f);
        }
      }
    }

    // --- ports: only leased ports with a lease; free input in simulation mode ---
    const leased = leasedPorts();
    for (const pf of portFieldsFor(draft)) {
      wiring.append(field(pf, portControl(pf, draft, leased, v => {
        draft = { ...draft, ports: { ...draft.ports, [pf]: v } };
        revalidate();
      })));
    }

    // --- verdict ---
    // Pure send's verdict is fixed (checkPureSend: frames sent equals packet count, nothing
    // leaked to the monitor), so there is no convergence/single/measurement choice and no
    // other check function to pick
    if (draft.shape.kind !== 'pure_send') {
      const checks = allowedChecksFor(draft);
      verdict.append(field('判定形狀', listbox(
        [['convergence', '收斂'], ['single', '單次判定'], ['measurement', '量測(無判定)']],
        draft.shape.kind,
        v => { draft = { ...draft, shape: { ...draft.shape, kind: v } }; render(); })));

      if (draft.shape.kind !== 'measurement') {
        // When no check fits this reader, an empty dropdown looks broken, so say why and
        // disable it (there must be no fake "no usable check" option to pick)
        const noChecks = checks.length === 0;
        const ctl = listbox(
          noChecks
            ? [['', '(這個 Reader 沒有可用的判別函式 —— 請改用「量測」或換 Reader)']]
            : checks.map(c => [c, c]),
          noChecks ? '' : draft.shape.check,
          v => { draft = { ...draft, shape: { ...draft.shape, check: v } }; render(); },
          { disabled: noChecks },
        );
        verdict.append(field('判別函式', ctl));
      }
    } else {
      const note = document.createElement('div');
      note.className = 'note';
      note.textContent = '自定封包的判定固定為:送出數等於 PCAP 的封包數,'
                       + '且 Monitor 埠沒有收到不該收到的封包。';
      verdict.append(note);
    }

    // --- each section's common and advanced parameters ---
    const boxes = { basic, wiring, verdict };
    for (const sec of SECTIONS) {
      const box = boxes[sec.key];

      for (const [k, label] of sec.cfg.filter(visible)) {
        const input = document.createElement('input');
        const v = draft.cfg?.[k];
        input.value = Array.isArray(v) ? v.join(',') : (v ?? '');
        input.onchange = () => {
          const raw = input.value.trim();
          const val = k === 'framesize_custom'
            ? raw.split(',').map(s => Number(s.trim())).filter(n => Number.isFinite(n))
            : (raw === '' ? undefined : Number(raw));
          draft = { ...draft, cfg: { ...draft.cfg, [k]: val } };
          revalidate();
        };
        box.append(field(label, input));
      }

      // module parameters that are rate details go under "Frames and connection" > Advanced
      const extra = sec.key === 'wiring' ? advancedParamFields : [];
      const rows = sec.advanced.filter(visible);
      if (rows.length === 0 && extra.length === 0) continue;

      const adv = document.createElement('details');
      const advSum = document.createElement('summary');
      advSum.textContent = '進階';
      adv.append(advSum, ...extra);
      for (const [k, label] of rows) {
        const input = document.createElement('input');
        input.value = draft.cfg?.[k] ?? '';
        input.placeholder = cfgPlaceholder(k);    // when empty, show the value the engine will actually use
        input.onchange = () => {
          const raw = input.value.trim();
          draft = { ...draft, cfg: { ...draft.cfg,
            [k]: raw === '' ? undefined : Number(raw) } };
          revalidate();
        };
        adv.append(field(label, input));
      }
      box.append(adv);
    }

    // Lock the whole form while running: the snapshot (runner.js) has frozen what this run
    // uses, so edits here would not affect it, and allowing them would suggest they do.
    // Disabled rather than refusing to open the editor: the user still needs to see the
    // current settings, just not change them.
    if (isRunning) {
      const lock = document.createElement('div');
      lock.className = 'validate warned';
      lock.textContent = '此測試項正在執行中,欄位暫時鎖定 —— 執行結束後才能編輯。';
      el.append(lock);
    }

    el.append(basic, wiring, verdict);

    if (isRunning) {
      for (const box of [basic, wiring, verdict]) {
        for (const ctl of box.querySelectorAll(
          'input, button.listbox-trigger, button.switch, button.pcap-import')) {
          ctl.disabled = true;
        }
      }
    }

    // --- validation hints ---
    const note = document.createElement('div');
    el.append(note);

    const save = document.createElement('button');
    save.className = 'primary';
    save.textContent = '儲存';
    save.onclick = () => { const d = draft; close(); onSave(d); };

    revalidate = () => {
      const v = validateItem(draft);
      note.className = `validate ${v.level}`;
      note.textContent = v.messages.join('　');
      save.disabled = !v.canQueue || isRunning;
    };
    revalidate();

    const cancel = document.createElement('button');
    cancel.textContent = '取消';
    cancel.onclick = () => close();

    const bar = document.createElement('div');
    bar.className = 'dialog-actions';
    bar.append(cancel, save);
    el.append(bar);
  }

  // discard the draft when closing with Esc, or the next open would show the unsaved content
  el.addEventListener('close', () => { draft = null; });

  return {
    edit(item) { draft = { ...item }; render(); el.showModal(); },
  };
}
