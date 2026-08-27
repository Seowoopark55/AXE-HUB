import React, { useEffect, useMemo, useState } from "react";
import { isSupabaseConfigured, supabase } from "./lib/supabase";

const SLOT_META = [
  { key: "outer", label: "겉옷", icon: "01", keywords: ["겉옷", "단독상의"] },
  { key: "top", label: "상의", icon: "02", keywords: ["상의"] },
  { key: "bottom", label: "하의", icon: "03", keywords: ["하의"] },
  { key: "shoes", label: "신발", icon: "04", keywords: ["신발"] }
];

const BASE_CATEGORIES = ["전체", "인기", "무법지대"];
const HIDDEN_TAGS = new Set(["AXE 추천", "AXE OFFICIAL", "공식"]);

const emptySlots = () =>
  Object.fromEntries(
    SLOT_META.map((slot) => [
      slot.key,
      { prefix_modbook_id: "", suffix_modbook_id: "", comment: "" }
    ])
  );

function cls(...parts) {
  return parts.filter(Boolean).join(" ");
}

function fmtDate(value) {
  if (!value) return "";
  try {
    return new Intl.DateTimeFormat("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(new Date(value));
  } catch {
    return "";
  }
}

function normalizeRange(text) {
  if (!text) return "";
  return String(text).replace(
    /\((-?\d+(?:\.\d+)?)%\s*~\s*(-?\d+(?:\.\d+)?)%\)/g,
    (_, a, b) => {
      const x = Number(a);
      const y = Number(b);
      if (Number.isNaN(x) || Number.isNaN(y)) return `(${a}% ~ ${b}%)`;
      return `(${Math.min(x, y)}% ~ ${Math.max(x, y)}%)`;
    }
  );
}

function optionLines(mod) {
  return [mod?.option1, mod?.option2, mod?.option3]
    .filter(Boolean)
    .map(normalizeRange);
}

function slotAllows(mod, slot) {
  const parts = String(mod?.parts || "");
  if (!parts) return true;
  if (slot.key === "top") {
    const pureTop =
      parts.includes("상의") &&
      (!parts.includes("겉옷/단독상의") || parts.split(",").some((v) => v.trim() === "상의"));
    return pureTop;
  }
  return slot.keywords.some((k) => parts.includes(k));
}


function visibleTags(tags = []) {
  return (tags || []).filter((tag) => tag && !HIDDEN_TAGS.has(String(tag).trim()));
}

function buildSearchText(build) {
  return [build?.title, build?.summary, build?.description, build?.author_name, ...visibleTags(build?.tags)]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function buildCategoryList(builds) {
  const priority = new Set(BASE_CATEGORIES);
  const tags = [];
  for (const build of builds || []) {
    for (const tag of visibleTags(build.tags)) {
      if (!priority.has(tag) && !tags.includes(tag)) tags.push(tag);
    }
  }
  return [...BASE_CATEGORIES, ...tags];
}

function formatSigned(value, unit = "") {
  if (!Number.isFinite(value)) return "-";
  const rounded = Math.abs(value % 1) < 0.001 ? Math.round(value) : Number(value.toFixed(1));
  return `${rounded > 0 ? "+" : ""}${rounded}${unit}`;
}

function extractBestOption(line) {
  const normalized = normalizeRange(line || "").replace(/^\*/, "").trim();
  const range = normalized.match(/\((-?\d+(?:\.\d+)?)\s*(%)?\s*~\s*(-?\d+(?:\.\d+)?)\s*(%)?\)/);
  if (!range) return null;
  const a = Number(range[1]);
  const b = Number(range[3]);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  const best = Math.max(a, b);
  const unit = range[2] || range[4] || "";
  const label = normalized.replace(range[0], "").replace(/\s+/g, " ").trim();
  if (!label) return null;
  return { label, value: best, unit };
}

function summarizeBuildOptions(slots, modMap) {
  const totals = new Map();
  const warnings = [];
  for (const slot of slots || []) {
    for (const id of [slot.prefix_modbook_id, slot.suffix_modbook_id]) {
      const mod = modMap.get(id);
      if (!mod) continue;
      for (const raw of optionLines(mod)) {
        if (String(raw).trim().startsWith("*")) warnings.push(String(raw).replace(/^\*/, "").trim());
        const parsed = extractBestOption(raw);
        if (!parsed) continue;
        const key = `${parsed.label}__${parsed.unit}`;
        const prev = totals.get(key) || { label: parsed.label, unit: parsed.unit, value: 0 };
        prev.value += parsed.value;
        totals.set(key, prev);
      }
    }
  }
  return { rows: [...totals.values()], warnings: [...new Set(warnings)] };
}

function Toast({ message, tone = "default" }) {
  if (!message) return null;
  return <div className={cls("toast", tone === "error" && "error")}>{message}</div>;
}

function Modal({ title, children, onClose, wide = false }) {
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section
        className={cls("modal", wide && "wide")}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="modal-head">
          <div>
            <div className="eyebrow">AXE HUB</div>
            <h2>{title}</h2>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="닫기">
            ×
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}

function Brand() {
  const [logoFailed, setLogoFailed] = useState(false);
  return (
    <div className="brand">
      <div className="brand-mark brand-logo-box">
        {!logoFailed ? (
          <img src="/assets/axe-logo.png" alt="AXE 로고" onError={() => setLogoFailed(true)} />
        ) : (
          <span className="brand-fallback">AXE</span>
        )}
      </div>
      <div>
        <strong>AXE BUILD</strong>
        <span>AXE HUB · PUBLIC BUILD LAB</span>
      </div>
    </div>
  );
}

function Header({ tab, setTab, user, profile, onLogin, onLogout, onCreate }) {
  return (
    <header className="topbar">
      <div className="shell topbar-inner">
        <button className="brand-btn" onClick={() => setTab("builds")} aria-label="AXE BUILD 홈">
          <Brand />
        </button>
        <nav className="nav">
          <button className={cls(tab === "builds" && "active")} onClick={() => setTab("builds")}>
            추천세팅
          </button>
          <button className={cls(tab === "modbooks" && "active")} onClick={() => setTab("modbooks")}>
            개조서
          </button>
          <button className={cls(tab === "reports" && "active")} onClick={() => setTab("reports")}>
            제보
          </button>
          {profile?.is_admin && (
            <button className={cls(tab === "admin" && "active")} onClick={() => setTab("admin")}>
              관리
            </button>
          )}
        </nav>
        <div className="header-actions">
          {user && (
            <button className="btn ghost compact desktop-only" onClick={onCreate}>
              + 세팅 작성
            </button>
          )}
          {user ? (
            <div className="user-chip">
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt="" />
              ) : (
                <div className="avatar-fallback">{(profile?.display_name || "?")[0]}</div>
              )}
              <div>
                <strong>{profile?.display_name || "Discord User"}</strong>
                <button onClick={onLogout}>로그아웃</button>
              </div>
            </div>
          ) : (
            <button className="btn discord" onClick={onLogin}>
              Discord로 계속하기
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

function Hero({ user, onCreate, onJump }) {
  return (
    <section className="hero shell hero-simple">
      <div className="hero-copy">
        <div className="eyebrow gold">AXE BUILD · PUBLIC SETTING HUB</div>
        <h1>추천세팅을<br />가장 빠르게 찾는 곳.</h1>
        <p>
          다른 사람의 세팅을 장비 슬롯 기준으로 확인하고, 필요한 조합은 복제해서 내 세팅으로 만들 수 있습니다.
          추천세팅과 개조서 열람은 로그인 없이 이용할 수 있습니다.
        </p>
        <div className="hero-actions">
          <button className="btn primary" onClick={onJump}>추천세팅 바로 보기</button>
          {user && <button className="btn ghost" onClick={onCreate}>내 세팅 만들기</button>}
        </div>
      </div>
    </section>
  );
}

function CompanyPromo() {
  const contact = String(import.meta.env.VITE_AXE_CONTACT_URL || "").trim();
  return (
    <section className="shell company-promo-wrap">
      <div className="company-promo">
        <div className="company-promo-copy">
          <span>AXE COMPANY · RECRUITMENT</span>
          <strong>함께 뛰고, 함께 성장하는 AXE.</strong>
          <p>AXE의 플레이와 분위기가 궁금하다면 회사 소개와 모집 안내를 확인해보세요.</p>
        </div>
        {contact && <a className="btn primary compact" href={contact} target="_blank" rel="noreferrer">AXE 문의</a>}
      </div>
    </section>
  );
}

function BuildCard({ build, slots, modMap, onOpen, favorite, onFavorite }) {
  const modName = (id) => modMap.get(id)?.name || "미지정";
  const tags = visibleTags(build.tags).slice(0, 3);
  return (
    <article className="build-card" onClick={() => onOpen(build)}>
      <div className="build-card-top">
        <div className="badges">
          {tags.map((tag) => <span className="badge" key={tag}>{tag}</span>)}
        </div>
        <button className={cls("favorite-btn", favorite && "active")} onClick={(e) => { e.stopPropagation(); onFavorite(build); }} aria-label="즐겨찾기">
          {favorite ? "★" : "☆"}
        </button>
      </div>
      <div className="build-title-row">
        <div><h3>{build.title}</h3><p>{build.summary || "세팅 설명이 없습니다."}</p></div>
        <span className="open-arrow">→</span>
      </div>
      <div className="mini-slot-grid">
        {SLOT_META.map((meta) => {
          const slot = (slots || []).find((v) => v.slot_key === meta.key);
          return (
            <div className="mini-slot" key={meta.key}>
              <div className="mini-slot-label"><span>{meta.icon}</span><strong>{meta.label}</strong></div>
              <div className="mini-slot-values">
                <span><em>접두</em>{modName(slot?.prefix_modbook_id)}</span>
                <span><em>접미</em>{modName(slot?.suffix_modbook_id)}</span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="build-meta">
        <span>{build.author_name || "익명"}</span><span>★ {build.favorite_count || 0}</span><span>조회 {build.view_count || 0}</span>
      </div>
    </article>
  );
}

function BuildsPage({
  builds,
  buildSlotsMap,
  modMap,
  loading,
  user,
  favorites,
  onOpen,
  onFavorite,
  onCreate,
  categoryFilter,
  setCategoryFilter
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("latest");
  const categories = useMemo(() => buildCategoryList(builds), [builds]);

  const rows = useMemo(() => {
    let result = builds.filter((build) => {
      const hay = buildSearchText(build);
      const qOk = hay.includes(query.trim().toLowerCase());
      const categoryOk =
        categoryFilter === "전체" ||
        categoryFilter === "인기" ||
        (categoryFilter === "무법지대" && hay.includes("무법")) ||
        visibleTags(build.tags).includes(categoryFilter);
      return qOk && categoryOk;
    });

    result = [...result].sort((a, b) => {
      if (categoryFilter === "인기" || sort === "popular") {
        return (b.favorite_count || 0) - (a.favorite_count || 0) ||
          (b.view_count || 0) - (a.view_count || 0) ||
          new Date(b.created_at) - new Date(a.created_at);
      }
      if (sort === "views") return (b.view_count || 0) - (a.view_count || 0);
      return new Date(b.created_at) - new Date(a.created_at);
    });
    return result;
  }, [builds, query, sort, categoryFilter]);

  return (
    <section className="shell section" id="build-archive">
      <div className="section-head">
        <div>
          <div className="eyebrow">BUILD ARCHIVE</div>
          <h2>추천세팅</h2>
          <p>카테고리를 선택하고 장비 슬롯 구성을 바로 비교해보세요.</p>
        </div>
        {user && <button className="btn primary" onClick={onCreate}>+ 세팅 작성</button>}
      </div>

      <div className="category-strip" aria-label="추천세팅 카테고리">
        {categories.map((category) => (
          <button
            key={category}
            className={cls(categoryFilter === category && "active")}
            onClick={() => setCategoryFilter(category)}
          >
            {category}
          </button>
        ))}
      </div>

      <div className="toolbar build-toolbar">
        <div className="searchbox">
          <span>⌕</span>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="세팅명, 태그, 작성자 검색" />
          {query && <button onClick={() => setQuery("")}>×</button>}
        </div>
        <select value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="latest">최신순</option>
          <option value="popular">인기순</option>
          <option value="views">조회순</option>
        </select>
      </div>

      {loading ? (
        <div className="empty">추천세팅을 불러오는 중...</div>
      ) : rows.length ? (
        <div className="build-grid">
          {rows.map((build) => (
            <BuildCard
              key={build.id}
              build={build}
              slots={buildSlotsMap[build.id] || []}
              modMap={modMap}
              onOpen={onOpen}
              favorite={favorites.has(build.id)}
              onFavorite={onFavorite}
            />
          ))}
        </div>
      ) : (
        <div className="empty">조건에 맞는 추천세팅이 없습니다.</div>
      )}
    </section>
  );
}

function Promo() {
  return null;
}

function ModbookDetail({ mod }) {
  if (!mod) return <div className="modbook-detail empty-detail">개조서를 선택하세요.</div>;
  return (
    <aside className="modbook-detail">
      <div className="detail-labels">
        <span className={cls("type-pill", mod.type === "접두" ? "prefix" : "suffix")}>{mod.type}</span>
        <span className="badge">{mod.category}</span>
        <span className="rate-chip">{mod.success_rate || "-"}</span>
      </div>
      <h3>{mod.name}</h3>
      <div className="detail-parts"><span>적용 부위</span><strong>{mod.parts || "-"}</strong></div>
      <div className="option-stack">
        {optionLines(mod).map((line, idx) => (
          <div key={idx} className={cls("option-line", line.trim().startsWith("*") && "warning")}>
            <span>{String(idx + 1).padStart(2, "0")}</span><strong>{line.replace(/^\*/, "")}</strong>
          </div>
        ))}
      </div>
      {mod.note && <div className="note-box"><span>NOTE</span><p>{mod.note}</p></div>}
    </aside>
  );
}

function ModbooksPage({ modbooks }) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");
  const [category, setCategory] = useState("all");
  const [parts, setParts] = useState("all");
  const [selectedId, setSelectedId] = useState(null);
  const categories = useMemo(() => [...new Set(modbooks.map((m) => m.category).filter(Boolean))].sort(), [modbooks]);

  const rows = useMemo(() => modbooks.filter((m) => {
    if (type !== "all" && m.type !== type) return false;
    if (category !== "all" && m.category !== category) return false;
    if (parts !== "all" && !String(m.parts || "").includes(parts)) return false;
    return [m.name, m.parts, m.category, ...optionLines(m)].join(" ").toLowerCase().includes(query.trim().toLowerCase());
  }), [modbooks, query, type, category, parts]);

  useEffect(() => {
    if (!rows.length) return setSelectedId(null);
    if (!selectedId || !rows.some((m) => m.id === selectedId)) setSelectedId(rows[0].id);
  }, [rows, selectedId]);

  const selected = rows.find((m) => m.id === selectedId) || null;

  return (
    <section className="shell section">
      <div className="section-head">
        <div><div className="eyebrow">MODBOOK DATABASE</div><h2>개조서 도감</h2><p>왼쪽에서 찾고, 오른쪽에서 옵션을 확인하는 도감형 구조로 정리했습니다.</p></div>
        <div className="stat-chip">{rows.length} / {modbooks.length}</div>
      </div>
      <div className="toolbar multi">
        <div className="searchbox"><span>⌕</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="개조서명 또는 옵션 검색" />{query && <button onClick={() => setQuery("")}>×</button>}</div>
        <select value={type} onChange={(e) => setType(e.target.value)}><option value="all">접두/접미 전체</option><option value="접두">접두</option><option value="접미">접미</option></select>
        <select value={category} onChange={(e) => setCategory(e.target.value)}><option value="all">분류 전체</option>{categories.map((v) => <option key={v} value={v}>{v}</option>)}</select>
        <select value={parts} onChange={(e) => setParts(e.target.value)}><option value="all">부위 전체</option>{["겉옷","상의","하의","신발","전부위"].map((v) => <option key={v} value={v}>{v}</option>)}</select>
      </div>
      <div className="modbook-browser">
        <div className="modbook-list">
          {rows.map((mod) => (
            <button key={mod.id} className={cls("modbook-list-row", selectedId === mod.id && "active")} onClick={() => setSelectedId(mod.id)}>
              <div><span className={cls("type-dot", mod.type === "접두" ? "prefix" : "suffix")}></span><strong>{mod.name}</strong></div>
              <div><span>{mod.category}</span><em>{mod.parts}</em></div>
            </button>
          ))}
          {!rows.length && <div className="empty compact-empty">검색 결과가 없습니다.</div>}
        </div>
        <ModbookDetail mod={selected} />
      </div>
    </section>
  );
}

function ReportsPage({ user, myReports, onNewReport, onLogin }) {
  return (
    <section className="shell section">
      <div className="section-head">
        <div><div className="eyebrow">DATA REPORT</div><h2>개조서 제보</h2><p>누락된 개조서와 잘못된 옵션을 한 곳에서 정리해 제보할 수 있습니다.</p></div>
        {user && <button className="btn primary" onClick={onNewReport}>+ 새 제보</button>}
      </div>
      <div className="report-guide">
        <div className="guide-card"><span>01</span><strong>누락 제보</strong><p>새로운 개조서가 도감에 없을 때 등록합니다.</p></div>
        <div className="guide-card"><span>02</span><strong>수정 제보</strong><p>기존 개조서의 수치·부위·옵션이 다를 때 수정 요청합니다.</p></div>
        <div className="guide-card"><span>03</span><strong>검수 반영</strong><p>관리자 승인 후 개조서 DB에 자동으로 반영됩니다.</p></div>
      </div>
      {!user ? (
        <div className="login-gate">
          <div><div className="eyebrow gold">DISCORD SIGN-IN</div><h3>제보와 세팅 저장에만 로그인이 필요합니다.</h3><p>추천세팅과 개조서는 로그인 없이 볼 수 있습니다. Discord 로그인은 작성자 식별과 개인 데이터 저장에만 사용하며 서버 가입·메시지 접근 권한은 요청하지 않습니다.</p></div>
          <button className="btn discord" onClick={onLogin}>Discord로 계속하기</button>
        </div>
      ) : myReports.length ? (
        <div className="report-list">
          {myReports.map((r) => (
            <article className="report-row" key={r.id}><div><span className={cls("status", r.status)}>{r.status}</span><strong>{r.name}</strong><span>{r.mod_type} · {r.category || "기타"}</span></div><time>{fmtDate(r.created_at)}</time></article>
          ))}
        </div>
      ) : <div className="empty">아직 등록한 제보가 없습니다.</div>}
    </section>
  );
}

function AdminPage({ profile, reports, onApprove, onReject }) {
  if (!profile?.is_admin) {
    return <section className="shell section"><div className="empty">관리자 권한이 없습니다.</div></section>;
  }
  const pending = reports.filter((r) => r.status === "pending");
  return (
    <section className="shell section">
      <div className="section-head">
        <div>
          <div className="eyebrow">ADMIN REVIEW</div>
          <h2>제보 검수</h2>
          <p>승인 시 개조서 DB에 즉시 반영됩니다.</p>
        </div>
        <div className="stat-chip">{pending.length} pending</div>
      </div>
      <div className="admin-list">
        {pending.map((r) => (
          <article className="admin-card" key={r.id}>
            <div className="admin-card-head">
              <div>
                <span className="status pending">pending</span>
                <h3>{r.name}</h3>
              </div>
              <span>{r.mod_type} · {r.category || "기타"}</span>
            </div>
            <dl>
              <div><dt>부위</dt><dd>{r.parts || "-"}</dd></div>
              <div><dt>옵션</dt><dd className="preline">{r.options_text || "-"}</dd></div>
              <div><dt>메모</dt><dd>{r.note || "-"}</dd></div>
            </dl>
            <div className="admin-actions">
              <button className="btn ghost" onClick={() => onReject(r)}>반려</button>
              <button className="btn primary" onClick={() => onApprove(r)}>승인</button>
            </div>
          </article>
        ))}
      </div>
      {!pending.length && <div className="empty">대기 중인 제보가 없습니다.</div>}
    </section>
  );
}

function BuildDetail({ build, slots, modMap, favorite, user, onFavorite, onClose, onClone }) {
  const summary = summarizeBuildOptions(slots, modMap);
  const tags = visibleTags(build.tags);

  return (
    <Modal title={build.title} onClose={onClose} wide>
      <div className="legacy-build-head">
        <div>
          <span className="member-build-label">{build.author_id ? "MEMBER BUILD" : "BUILD"}</span>
          <div className="badges">{tags.map((tag) => <span className="badge" key={tag}>{tag}</span>)}</div>
          <p>{build.summary || "세팅 설명이 없습니다."}</p>
        </div>
        <div className="detail-stats">
          <span>작성 {build.author_name || "익명"}</span>
          <span>★ {build.favorite_count || 0}</span>
          <span>조회 {build.view_count || 0}</span>
        </div>
      </div>

      {build.description && <div className="description legacy-description">{build.description}</div>}

      <div className="legacy-build-layout">
        <section className="inventory-panel">
          <div className="inventory-tabs">
            <span>인벤토리</span>
            <strong>장비 <b>4</b></strong>
            <em>AXE BUILD</em>
          </div>
          <div className="equipment-grid">
            {SLOT_META.map((meta) => {
              const slot = slots.find((s) => s.slot_key === meta.key);
              const prefix = modMap.get(slot?.prefix_modbook_id);
              const suffix = modMap.get(slot?.suffix_modbook_id);
              return (
                <article className="equipment-item" key={meta.key}>
                  <div className="equipment-visual">
                    <span className="equipment-code">{meta.icon}</span>
                    <strong>{meta.label}</strong>
                    <small>{meta.key.toUpperCase()}</small>
                  </div>
                  <div className="equipment-name">{meta.label}</div>
                  <div className="equipment-mods">
                    <div><span>접두</span><b>{prefix?.name || "선택 없음"}</b></div>
                    <div><span>접미</span><b>{suffix?.name || "선택 없음"}</b></div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <aside className="summary-panel">
          <div className="summary-head">
            <div><span>MAX ROLL SUMMARY</span><strong>전체 옵션 요약</strong></div>
            <em>최대값 합산</em>
          </div>
          <div className="summary-rows">
            {summary.rows.length ? summary.rows.map((row) => (
              <div className="summary-row" key={`${row.label}-${row.unit}`}>
                <span>{row.label}</span><strong>{formatSigned(row.value, row.unit)}</strong>
              </div>
            )) : <div className="summary-empty">계산 가능한 옵션 범위가 없습니다.</div>}
          </div>

          {summary.warnings.length > 0 && (
            <div className="warning-summary">
              <span>주의 옵션</span>
              {summary.warnings.slice(0, 3).map((warning) => <p key={warning}>{warning}</p>)}
            </div>
          )}

          <div className="part-comments">
            <span>부위별 코멘트</span>
            {SLOT_META.map((meta) => {
              const slot = slots.find((s) => s.slot_key === meta.key);
              if (!slot?.comment) return null;
              return <div key={meta.key}><strong>{meta.label}</strong><p>{slot.comment}</p></div>;
            })}
          </div>
          <div className="summary-footnote">장비 슬롯을 기준으로 접두·접미 조합을 한 화면에서 확인할 수 있습니다.</div>
        </aside>
      </div>

      <div className="modal-actions sticky">
        {user && <button className="btn ghost" onClick={onClone}>복제해서 작성</button>}
        <button className={cls("btn", favorite ? "primary" : "ghost")} onClick={() => onFavorite(build)}>
          {favorite ? "★ 즐겨찾기 해제" : "☆ 즐겨찾기"}
        </button>
      </div>
    </Modal>
  );
}

function SlotMod({ label, mod }) {
  if (!mod) return <div className="slot-mod empty-mod"><span>{label}</span><strong>선택 없음</strong></div>;
  return (
    <div className="slot-mod">
      <span>{label}</span>
      <strong>{mod.name}</strong>
      <small>{mod.category} · {mod.parts}</small>
    </div>
  );
}

function ModifierPicker({ type, slotMeta, modbooks, value, onChange }) {
  const [category, setCategory] = useState("전체 분류");
  const [query, setQuery] = useState("");
  const candidates = useMemo(
    () => modbooks.filter((m) => m.type === type && slotAllows(m, slotMeta)),
    [modbooks, type, slotMeta.key]
  );
  const categories = useMemo(() => [...new Set(candidates.map((m) => m.category).filter(Boolean))].sort(), [candidates]);
  const filtered = useMemo(() => candidates.filter((m) => {
    if (category !== "전체 분류" && m.category !== category) return false;
    const hay = [m.name, m.category, m.parts, ...optionLines(m)].join(" ").toLowerCase();
    return hay.includes(query.trim().toLowerCase());
  }), [candidates, category, query]);

  return (
    <div className="modifier-picker">
      <div className="modifier-picker-head"><strong>{type}</strong><span>{candidates.length}개</span></div>
      <div className="modifier-picker-filters">
        <label><span>분류</span><select value={category} onChange={(e) => setCategory(e.target.value)}><option>전체 분류</option>{categories.map((v) => <option key={v}>{v}</option>)}</select></label>
        <label><span>검색</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="개조서명 / 옵션 검색" /></label>
      </div>
      <label className="modifier-select"><span>선택</span><select value={value || ""} onChange={(e) => onChange(e.target.value)}><option value="">선택 안 함</option>{filtered.map((m) => <option key={m.id} value={m.id}>[{m.category}] {m.name}</option>)}</select></label>
    </div>
  );
}

function BuildEditor({ user, profile, modbooks, initialBuild, initialSlots, onClose, onSaved }) {
  const draftKey = `axe-build-draft-${user?.id || "guest"}`;
  const initial = useMemo(() => {
    try {
      if (!initialBuild) {
        const saved = localStorage.getItem(draftKey);
        if (saved) return JSON.parse(saved);
      }
    } catch {}
    return null;
  }, []);

  const [form, setForm] = useState(initial?.form || {
    title: initialBuild?.title ? `${initialBuild.title} 복제` : "",
    summary: initialBuild?.summary || "",
    description: initialBuild?.description || "",
    tags: visibleTags(initialBuild?.tags || []).join(", ")
  });
  const [slots, setSlots] = useState(() => {
    if (initial?.slots) return initial.slots;
    const base = emptySlots();
    (initialSlots || []).forEach((s) => {
      base[s.slot_key] = {
        prefix_modbook_id: s.prefix_modbook_id || "",
        suffix_modbook_id: s.suffix_modbook_id || "",
        comment: s.comment || ""
      };
    });
    return base;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (initialBuild) return;
    const timer = window.setTimeout(() => {
      try { localStorage.setItem(draftKey, JSON.stringify({ form, slots })); } catch {}
    }, 250);
    return () => window.clearTimeout(timer);
  }, [form, slots, initialBuild, draftKey]);

  const setField = (k, v) => setForm((prev) => ({ ...prev, [k]: v }));
  const setSlot = (slotKey, k, v) => setSlots((prev) => ({ ...prev, [slotKey]: { ...prev[slotKey], [k]: v } }));

  async function save() {
    if (!form.title.trim()) return setError("세팅 제목을 입력하세요.");
    setSaving(true);
    setError("");
    try {
      const tags = form.tags.split(",").map((v) => v.trim()).filter(Boolean).filter((v) => !HIDDEN_TAGS.has(v)).slice(0, 8);
      const { data: build, error: buildError } = await supabase
        .from("builds")
        .insert({
          author_id: user.id,
          author_name: profile?.display_name || user.user_metadata?.full_name || "Discord User",
          title: form.title.trim(),
          summary: form.summary.trim(),
          description: form.description.trim(),
          tags,
          is_published: true,
          is_official: false
        })
        .select("*")
        .single();
      if (buildError) throw buildError;

      const slotRows = SLOT_META.map((meta) => ({
        build_id: build.id,
        slot_key: meta.key,
        prefix_modbook_id: slots[meta.key].prefix_modbook_id ? Number(slots[meta.key].prefix_modbook_id) : null,
        suffix_modbook_id: slots[meta.key].suffix_modbook_id ? Number(slots[meta.key].suffix_modbook_id) : null,
        comment: slots[meta.key].comment.trim()
      }));
      const { error: slotError } = await supabase.from("build_slots").insert(slotRows);
      if (slotError) {
        await supabase.from("builds").delete().eq("id", build.id);
        throw slotError;
      }
      try { localStorage.removeItem(draftKey); } catch {}
      onSaved(build);
    } catch (e) {
      setError(e.message || "저장 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="추천세팅 작성" onClose={onClose} wide>
      {!initialBuild && <div className="draft-banner"><strong>작성 내용 자동 임시저장</strong><span>브라우저를 닫거나 새로고침해도 작성 중인 내용이 복원됩니다.</span></div>}
      <div className="form-grid legacy-form-top">
        <label className="full"><span>제목</span><input value={form.title} onChange={(e) => setField("title", e.target.value)} placeholder="예: 이동속도 1티어 / 무법 생존 세팅" /></label>
        <label className="full"><span>태그</span><input value={form.tags} onChange={(e) => setField("tags", e.target.value)} placeholder="무법지대, 이동속도, 밸런스 (쉼표 구분)" /></label>
        <label className="full"><span>설명</span><textarea value={form.description} onChange={(e) => setField("description", e.target.value)} placeholder="이 조합을 추천하는 이유, 실제 사용감, 주의점 등을 적어주세요." /></label>
        <label className="full compact-summary-field"><span>한줄 요약</span><input value={form.summary} onChange={(e) => setField("summary", e.target.value)} placeholder="목록에서 보일 짧은 설명" /></label>
      </div>

      <div className="legacy-editor-grid">
        {SLOT_META.map((meta) => (
          <section className="legacy-slot-editor" key={meta.key}>
            <div className="legacy-slot-head">
              <div className="slot-thumb"><span>{meta.icon}</span></div>
              <div><small>장비 부위</small><strong>{meta.label}</strong><span>접두·접미 개조서를 선택합니다.</span></div>
            </div>
            <ModifierPicker type="접두" slotMeta={meta} modbooks={modbooks} value={slots[meta.key].prefix_modbook_id} onChange={(v) => setSlot(meta.key, "prefix_modbook_id", v)} />
            <ModifierPicker type="접미" slotMeta={meta} modbooks={modbooks} value={slots[meta.key].suffix_modbook_id} onChange={(v) => setSlot(meta.key, "suffix_modbook_id", v)} />
            <label className="slot-comment-editor"><span>부위 설명</span><textarea value={slots[meta.key].comment} onChange={(e) => setSlot(meta.key, "comment", e.target.value)} placeholder="이 부위 조합을 선택한 이유" /></label>
          </section>
        ))}
      </div>

      <div className="editor-standard"><strong>작성 기준</strong><span>개조서 수치는 직접 입력하지 않습니다. AXE HUB에 등록된 개조서 옵션을 사용하고 게시글에서는 최대 옵션 기준으로 표시합니다.</span></div>
      {error && <div className="form-error">{error}</div>}
      <div className="modal-actions sticky"><button className="btn ghost" onClick={onClose}>취소</button><button className="btn primary" onClick={save} disabled={saving}>{saving ? "저장 중..." : "게시하기"}</button></div>
    </Modal>
  );
}

function ReportEditor({ user, modbooks, onClose, onSaved }) {
  const [form, setForm] = useState({
    report_type: "missing",
    target_modbook_id: "",
    name: "",
    mod_type: "접두",
    category: "",
    parts: "",
    options_text: "",
    note: ""
  });
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function set(k, v) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  function chooseTarget(value) {
    const mod = modbooks.find((m) => String(m.id) === String(value));
    setForm((prev) => ({
      ...prev,
      target_modbook_id: value,
      name: mod?.name || prev.name,
      mod_type: mod?.type || prev.mod_type,
      category: mod?.category || prev.category,
      parts: mod?.parts || prev.parts,
      options_text: mod ? optionLines(mod).join("\n") : prev.options_text
    }));
  }

  async function save() {
    if (!form.name.trim()) return setError("개조서 이름을 입력하세요.");
    setSaving(true);
    setError("");
    try {
      let evidence_path = null;
      if (file) {
        const ext = (file.name.split(".").pop() || "png").toLowerCase();
        evidence_path = `${user.id}/${crypto.randomUUID()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("modbook-evidence")
          .upload(evidence_path, file, { upsert: false });
        if (uploadError) throw uploadError;
      }

      const { error: insertError } = await supabase.from("modbook_reports").insert({
        reporter_id: user.id,
        report_type: form.report_type,
        target_modbook_id: form.target_modbook_id ? Number(form.target_modbook_id) : null,
        name: form.name.trim(),
        mod_type: form.mod_type,
        category: form.category.trim() || null,
        parts: form.parts.trim() || null,
        options_text: form.options_text.trim() || null,
        note: form.note.trim() || null,
        evidence_path
      });
      if (insertError) throw insertError;
      onSaved();
    } catch (e) {
      setError(e.message || "제보 등록 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="개조서 제보" onClose={onClose}>
      <div className="form-grid">
        <label>
          <span>제보 유형</span>
          <select value={form.report_type} onChange={(e) => set("report_type", e.target.value)}>
            <option value="missing">누락 제보</option>
            <option value="correction">정보 수정</option>
          </select>
        </label>
        {form.report_type === "correction" && (
          <label>
            <span>수정 대상</span>
            <select value={form.target_modbook_id} onChange={(e) => chooseTarget(e.target.value)}>
              <option value="">직접 입력</option>
              {modbooks.map((m) => <option key={m.id} value={m.id}>[{m.type}/{m.category}] {m.name}</option>)}
            </select>
          </label>
        )}
        <label>
          <span>개조서 이름 *</span>
          <input value={form.name} onChange={(e) => set("name", e.target.value)} />
        </label>
        <label>
          <span>접두/접미</span>
          <select value={form.mod_type} onChange={(e) => set("mod_type", e.target.value)}>
            <option value="접두">접두</option>
            <option value="접미">접미</option>
          </select>
        </label>
        <label>
          <span>분류</span>
          <input value={form.category} onChange={(e) => set("category", e.target.value)} placeholder="이동속도, 채광 등" />
        </label>
        <label>
          <span>적용 부위</span>
          <input value={form.parts} onChange={(e) => set("parts", e.target.value)} />
        </label>
        <label className="full">
          <span>옵션 · 한 줄에 하나</span>
          <textarea value={form.options_text} onChange={(e) => set("options_text", e.target.value)} />
        </label>
        <label className="full">
          <span>메모</span>
          <textarea value={form.note} onChange={(e) => set("note", e.target.value)} />
        </label>
        <label className="full">
          <span>스크린샷 증빙 · 선택</span>
          <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        </label>
      </div>
      {error && <div className="form-error">{error}</div>}
      <div className="modal-actions sticky">
        <button className="btn ghost" onClick={onClose}>취소</button>
        <button className="btn primary" onClick={save} disabled={saving}>{saving ? "등록 중..." : "제보 등록"}</button>
      </div>
    </Modal>
  );
}

export default function App() {
  const [tab, setTab] = useState("builds");
  const [session, setSession] = useState(null);
  const user = session?.user || null;
  const [profile, setProfile] = useState(null);

  const [builds, setBuilds] = useState([]);
  const [buildSlotsMap, setBuildSlotsMap] = useState({});
  const [modbooks, setModbooks] = useState([]);
  const [favorites, setFavorites] = useState(new Set());
  const [myReports, setMyReports] = useState([]);
  const [adminReports, setAdminReports] = useState([]);

  const [loading, setLoading] = useState(true);
  const [selectedBuild, setSelectedBuild] = useState(null);
  const [selectedSlots, setSelectedSlots] = useState([]);
  const [editor, setEditor] = useState(null);
  const [reportEditor, setReportEditor] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState("전체");
  const [toast, setToast] = useState({ message: "", tone: "default" });

  const modMap = useMemo(() => new Map(modbooks.map((m) => [m.id, m])), [modbooks]);

  function notify(message, tone = "default") {
    setToast({ message, tone });
    window.clearTimeout(window.__axeToastTimer);
    window.__axeToastTimer = window.setTimeout(() => setToast({ message: "", tone: "default" }), 3200);
  }

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (alive) setSession(data.session || null);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession || null);
    });

    Promise.all([loadBuilds(), loadModbooks()]).finally(() => {
      if (alive) setLoading(false);
    });

    return () => {
      alive = false;
      listener?.subscription?.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!user) {
      setProfile(null);
      setFavorites(new Set());
      setMyReports([]);
      setAdminReports([]);
      return;
    }
    loadUserData(user.id);
  }, [user?.id]);

  useEffect(() => {
    if (profile?.is_admin) loadAdminReports();
  }, [profile?.is_admin]);

  async function loadBuilds() {
    const { data, error } = await supabase.from("builds").select("*").order("created_at", { ascending: false });
    if (error) return notify(`추천세팅 로드 실패: ${error.message}`, "error");
    const rows = data || [];
    setBuilds(rows);
    if (!rows.length) return setBuildSlotsMap({});
    const { data: slotRows, error: slotError } = await supabase.from("build_slots").select("*").in("build_id", rows.map((b) => b.id)).order("id");
    if (slotError) return notify(`세팅 슬롯 로드 실패: ${slotError.message}`, "error");
    const map = {};
    for (const row of slotRows || []) {
      if (!map[row.build_id]) map[row.build_id] = [];
      map[row.build_id].push(row);
    }
    setBuildSlotsMap(map);
  }

  async function loadModbooks() {
    const { data, error } = await supabase
      .from("modbooks")
      .select("*")
      .order("sort_order", { ascending: true });
    if (error) return notify(`개조서 로드 실패: ${error.message}`, "error");
    setModbooks(data || []);
  }

  async function loadUserData(userId) {
    const [{ data: p }, { data: fav }, { data: reports }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
      supabase.from("favorites").select("build_id").eq("user_id", userId),
      supabase.from("modbook_reports").select("*").eq("reporter_id", userId).order("created_at", { ascending: false })
    ]);
    setProfile(p || null);
    setFavorites(new Set((fav || []).map((f) => f.build_id)));
    setMyReports(reports || []);
  }

  async function loadAdminReports() {
    const { data, error } = await supabase
      .from("modbook_reports")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) return notify(error.message, "error");
    setAdminReports(data || []);
  }

  async function login() {
    if (!isSupabaseConfigured) return notify("Supabase 환경변수를 먼저 설정하세요.", "error");
    const redirectTo = String(import.meta.env.VITE_SITE_URL || window.location.origin).replace(/\/$/, "");
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "discord",
      options: {
        redirectTo,
        scopes: "identify email"
      }
    });
    if (error) notify(error.message, "error");
  }

  async function logout() {
    await supabase.auth.signOut();
    notify("로그아웃했습니다.");
  }

  async function openBuild(build) {
    setSelectedBuild(build);
    const cached = buildSlotsMap[build.id];
    if (cached) setSelectedSlots(cached);
    else {
      const { data, error } = await supabase.from("build_slots").select("*").eq("build_id", build.id).order("id");
      if (error) notify(error.message, "error");
      setSelectedSlots(data || []);
    }
    supabase.rpc("increment_build_view", { p_build_id: build.id }).then(() => loadBuilds());
  }

  async function toggleFavorite(build) {
    if (!user) return notify("즐겨찾기는 Discord 로그인 후 사용할 수 있습니다.", "error");
    const exists = favorites.has(build.id);
    let error;
    if (exists) {
      ({ error } = await supabase.from("favorites").delete().eq("user_id", user.id).eq("build_id", build.id));
    } else {
      ({ error } = await supabase.from("favorites").insert({ user_id: user.id, build_id: build.id }));
    }
    if (error) return notify(error.message, "error");
    const next = new Set(favorites);
    exists ? next.delete(build.id) : next.add(build.id);
    setFavorites(next);
    await loadBuilds();
  }

  async function saveFinished(build) {
    setEditor(null);
    await loadBuilds();
    notify("추천세팅을 게시했습니다.");
    openBuild(build);
  }

  async function reportFinished() {
    setReportEditor(false);
    if (user) await loadUserData(user.id);
    notify("제보를 등록했습니다.");
  }

  async function approve(report) {
    const { error } = await supabase.rpc("approve_modbook_report", { p_report_id: report.id });
    if (error) return notify(error.message, "error");
    notify("제보를 승인했습니다.");
    await Promise.all([loadAdminReports(), loadModbooks()]);
  }

  async function reject(report) {
    const { error } = await supabase.rpc("reject_modbook_report", { p_report_id: report.id });
    if (error) return notify(error.message, "error");
    notify("제보를 반려했습니다.");
    await loadAdminReports();
  }

  function jumpToBuilds() {
    setTab("builds");
    window.setTimeout(() => document.getElementById("build-archive")?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  }


  if (!isSupabaseConfigured) {
    return (
      <div className="config-screen">
        <Brand />
        <div className="config-card">
          <div className="eyebrow gold">SETUP REQUIRED</div>
          <h1>AXE HUB 연결 정보가 필요합니다.</h1>
          <p>프로젝트 루트에 <code>.env.local</code> 파일을 만들고 아래 두 값을 입력하세요.</p>
          <pre>{`VITE_SUPABASE_URL=https://...supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...`}</pre>
          <small>Secret key / service_role 키는 웹에 절대 넣지 마세요.</small>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <Header
        tab={tab}
        setTab={setTab}
        user={user}
        profile={profile}
        onLogin={login}
        onLogout={logout}
        onCreate={() => setEditor({ build: null, slots: [] })}
      />

      {tab === "builds" && (
        <>
          <Hero
            user={user}
            onCreate={() => setEditor({ build: null, slots: [] })}
            onJump={jumpToBuilds}
          />
          <CompanyPromo />
          <BuildsPage
            builds={builds}
            buildSlotsMap={buildSlotsMap}
            modMap={modMap}
            loading={loading}
            user={user}
            favorites={favorites}
            onOpen={openBuild}
            onFavorite={toggleFavorite}
            onCreate={() => setEditor({ build: null, slots: [] })}
            categoryFilter={categoryFilter}
            setCategoryFilter={setCategoryFilter}
          />
        </>
      )}
      {tab === "modbooks" && <ModbooksPage modbooks={modbooks} />}
      {tab === "reports" && (
        <ReportsPage user={user} myReports={myReports} onNewReport={() => setReportEditor(true)} onLogin={login} />
      )}
      {tab === "admin" && (
        <AdminPage profile={profile} reports={adminReports} onApprove={approve} onReject={reject} />
      )}

      <footer className="footer">
        <div className="shell">
          <Brand />
          <span>AXE HUB · External Public Service</span>
        </div>
      </footer>

      {selectedBuild && (
        <BuildDetail
          build={selectedBuild}
          slots={selectedSlots}
          modMap={modMap}
          favorite={favorites.has(selectedBuild.id)}
          user={user}
          onFavorite={toggleFavorite}
          onClose={() => setSelectedBuild(null)}
          onClone={() => {
            setEditor({ build: selectedBuild, slots: selectedSlots });
            setSelectedBuild(null);
          }}
        />
      )}

      {editor && user && (
        <BuildEditor
          user={user}
          profile={profile}
          modbooks={modbooks}
          initialBuild={editor.build}
          initialSlots={editor.slots}
          onClose={() => setEditor(null)}
          onSaved={saveFinished}
        />
      )}

      {reportEditor && user && (
        <ReportEditor
          user={user}
          modbooks={modbooks}
          onClose={() => setReportEditor(false)}
          onSaved={reportFinished}
        />
      )}

      <Toast message={toast.message} tone={toast.tone} />

      {user && (
        <button className="fab mobile-only" onClick={() => setEditor({ build: null, slots: [] })}>
          +
        </button>
      )}
    </div>
  );
}
