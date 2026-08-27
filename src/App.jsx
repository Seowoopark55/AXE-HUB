import React, { useEffect, useMemo, useState } from "react";
import { isSupabaseConfigured, supabase } from "./lib/supabase";

const SLOT_META = [
  { key: "outer", label: "겉옷", keywords: ["겉옷", "단독상의"] },
  { key: "top", label: "상의", keywords: ["상의"] },
  { key: "bottom", label: "하의", keywords: ["하의"] },
  { key: "shoes", label: "신발", keywords: ["신발"] }
];

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
  return (
    <div className="brand">
      <div className="brand-mark">A</div>
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
        <Brand />
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
              Discord 로그인
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

function Hero({ user, onCreate, setTab }) {
  return (
    <section className="hero shell">
      <div className="hero-copy">
        <div className="eyebrow gold">AXE COMMUNITY BUILD DATABASE</div>
        <h1>
          세팅은 더 빠르게,
          <br />
          선택은 더 정확하게.
        </h1>
        <p>
          검증된 추천세팅을 찾아보고, 원하는 조합을 복제해서 나만의 빌드로 저장하세요.
          AXE의 개조서 데이터와 커뮤니티 세팅을 한 곳에서 확인할 수 있습니다.
        </p>
        <div className="hero-actions">
          <button className="btn primary" onClick={() => setTab("builds")}>
            추천세팅 둘러보기
          </button>
          <button className="btn ghost" onClick={user ? onCreate : () => setTab("modbooks")}>
            {user ? "내 세팅 만들기" : "개조서 찾아보기"}
          </button>
        </div>
      </div>
      <div className="hero-panel">
        <div className="hero-panel-top">
          <span>AXE BUILD</span>
          <span className="live-dot">LIVE</span>
        </div>
        <div className="gear-stack">
          <div className="gear-row"><span>01</span><strong>겉옷</strong><em>접두 + 접미</em></div>
          <div className="gear-row"><span>02</span><strong>상의</strong><em>접두 + 접미</em></div>
          <div className="gear-row"><span>03</span><strong>하의</strong><em>접두 + 접미</em></div>
          <div className="gear-row"><span>04</span><strong>신발</strong><em>접두 + 접미</em></div>
        </div>
        <div className="hero-panel-foot">BUILD · COMPARE · SHARE</div>
      </div>
    </section>
  );
}

function BuildCard({ build, onOpen, favorite, onFavorite }) {
  return (
    <article className="build-card" onClick={() => onOpen(build)}>
      <div className="build-card-top">
        <div className="badges">
          {build.is_official && <span className="badge official">AXE OFFICIAL</span>}
          {(build.tags || []).slice(0, 2).map((tag) => (
            <span className="badge" key={tag}>{tag}</span>
          ))}
        </div>
        <button
          className={cls("favorite-btn", favorite && "active")}
          onClick={(e) => {
            e.stopPropagation();
            onFavorite(build);
          }}
          aria-label="즐겨찾기"
        >
          {favorite ? "★" : "☆"}
        </button>
      </div>
      <h3>{build.title}</h3>
      <p>{build.summary || "세팅 설명이 없습니다."}</p>
      <div className="build-meta">
        <span>{build.author_name || "익명"}</span>
        <span>★ {build.favorite_count || 0}</span>
        <span>조회 {build.view_count || 0}</span>
      </div>
    </article>
  );
}

function BuildsPage({
  builds,
  loading,
  user,
  favorites,
  onOpen,
  onFavorite,
  onCreate
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("latest");

  const rows = useMemo(() => {
    let result = builds.filter((b) => {
      const hay = [
        b.title,
        b.summary,
        b.description,
        b.author_name,
        ...(b.tags || [])
      ].join(" ").toLowerCase();
      return hay.includes(query.trim().toLowerCase());
    });
    result = [...result].sort((a, b) => {
      if (sort === "popular") {
        return (b.favorite_count || 0) - (a.favorite_count || 0) ||
          (b.view_count || 0) - (a.view_count || 0);
      }
      if (sort === "views") return (b.view_count || 0) - (a.view_count || 0);
      return new Date(b.created_at) - new Date(a.created_at);
    });
    return result;
  }, [builds, query, sort]);

  return (
    <section className="shell section">
      <div className="section-head">
        <div>
          <div className="eyebrow">BUILD ARCHIVE</div>
          <h2>추천세팅</h2>
          <p>AXE 공식 세팅과 커뮤니티가 공유한 조합을 확인할 수 있습니다.</p>
        </div>
        {user && <button className="btn primary" onClick={onCreate}>+ 세팅 작성</button>}
      </div>

      <div className="toolbar">
        <div className="searchbox">
          <span>⌕</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="세팅명, 태그, 작성자 검색"
          />
          {query && <button onClick={() => setQuery("")}>×</button>}
        </div>
        <select value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="latest">최신순</option>
          <option value="popular">즐겨찾기순</option>
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
              onOpen={onOpen}
              favorite={favorites.has(build.id)}
              onFavorite={onFavorite}
            />
          ))}
        </div>
      ) : (
        <div className="empty">조건에 맞는 추천세팅이 없습니다.</div>
      )}

      <Promo />
    </section>
  );
}

function Promo() {
  const contact = String(import.meta.env.VITE_AXE_CONTACT_URL || "").trim();
  return (
    <div className="promo">
      <div>
        <div className="eyebrow gold">AXE COMMUNITY</div>
        <h3>같이 뛰고, 같이 만들고, 같이 강해진다.</h3>
        <p>
          AXE BUILD는 외부 공개형 세팅 허브입니다. AXE 모집 포스터를 추가하면 이 영역에
          함께 노출할 수 있습니다.
        </p>
      </div>
      {contact && (
        <a className="btn primary" href={contact} target="_blank" rel="noreferrer">
          AXE 문의하기
        </a>
      )}
    </div>
  );
}

function ModbookCard({ mod }) {
  return (
    <article className="modbook-card">
      <div className="modbook-head">
        <span className={cls("type-pill", mod.type === "접두" ? "prefix" : "suffix")}>{mod.type}</span>
        <span className="category">{mod.category}</span>
        <span className="rate">{mod.success_rate || "-"}</span>
      </div>
      <h3>{mod.name}</h3>
      <div className="parts">{mod.parts}</div>
      <ul>
        {optionLines(mod).map((line, idx) => (
          <li key={idx} className={line.trim().startsWith("*") ? "warning" : ""}>
            {line.replace(/^\*/, "")}
          </li>
        ))}
      </ul>
      {mod.note && <p className="note">{mod.note}</p>}
    </article>
  );
}

function ModbooksPage({ modbooks }) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");
  const [category, setCategory] = useState("all");
  const categories = useMemo(
    () => [...new Set(modbooks.map((m) => m.category).filter(Boolean))].sort(),
    [modbooks]
  );

  const rows = useMemo(() => {
    return modbooks.filter((m) => {
      if (type !== "all" && m.type !== type) return false;
      if (category !== "all" && m.category !== category) return false;
      const hay = [m.name, m.parts, m.category, ...optionLines(m)].join(" ").toLowerCase();
      return hay.includes(query.trim().toLowerCase());
    });
  }, [modbooks, query, type, category]);

  return (
    <section className="shell section">
      <div className="section-head">
        <div>
          <div className="eyebrow">MODBOOK DATABASE</div>
          <h2>개조서 도감</h2>
          <p>추천세팅에 사용되는 개조서 옵션과 적용 부위를 빠르게 찾아볼 수 있습니다.</p>
        </div>
        <div className="stat-chip">{rows.length} / {modbooks.length}</div>
      </div>
      <div className="toolbar multi">
        <div className="searchbox">
          <span>⌕</span>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="개조서명 또는 옵션 검색" />
          {query && <button onClick={() => setQuery("")}>×</button>}
        </div>
        <select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="all">접두/접미 전체</option>
          <option value="접두">접두</option>
          <option value="접미">접미</option>
        </select>
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="all">분류 전체</option>
          {categories.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
      </div>
      <div className="modbook-grid">
        {rows.map((mod) => <ModbookCard key={mod.id} mod={mod} />)}
      </div>
      {!rows.length && <div className="empty">검색 결과가 없습니다.</div>}
    </section>
  );
}

function ReportsPage({ user, myReports, onNewReport }) {
  return (
    <section className="shell section">
      <div className="section-head">
        <div>
          <div className="eyebrow">DATA REPORT</div>
          <h2>개조서 제보</h2>
          <p>누락된 개조서나 잘못된 정보를 Discord 로그인 후 제보할 수 있습니다.</p>
        </div>
        {user && <button className="btn primary" onClick={onNewReport}>+ 새 제보</button>}
      </div>

      {!user ? (
        <div className="empty strong">
          Discord 로그인이 필요합니다.
          <small>로그인 후 누락/수정 제보와 이미지 증빙을 등록할 수 있습니다.</small>
        </div>
      ) : myReports.length ? (
        <div className="report-list">
          {myReports.map((r) => (
            <article className="report-row" key={r.id}>
              <div>
                <span className={cls("status", r.status)}>{r.status}</span>
                <strong>{r.name}</strong>
                <span>{r.mod_type} · {r.category || "기타"}</span>
              </div>
              <time>{fmtDate(r.created_at)}</time>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty">아직 등록한 제보가 없습니다.</div>
      )}
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
  return (
    <Modal title={build.title} onClose={onClose} wide>
      <div className="detail-summary">
        <div>
          <div className="badges">
            {build.is_official && <span className="badge official">AXE OFFICIAL</span>}
            {(build.tags || []).map((tag) => <span className="badge" key={tag}>{tag}</span>)}
          </div>
          <p>{build.summary}</p>
        </div>
        <div className="detail-stats">
          <span>작성 {build.author_name}</span>
          <span>★ {build.favorite_count || 0}</span>
          <span>조회 {build.view_count || 0}</span>
        </div>
      </div>
      {build.description && <div className="description">{build.description}</div>}
      <div className="slot-grid">
        {SLOT_META.map((meta) => {
          const slot = slots.find((s) => s.slot_key === meta.key);
          const prefix = modMap.get(slot?.prefix_modbook_id);
          const suffix = modMap.get(slot?.suffix_modbook_id);
          return (
            <article className="slot-card" key={meta.key}>
              <div className="slot-title"><span>{meta.label}</span><em>{meta.key.toUpperCase()}</em></div>
              <SlotMod label="접두" mod={prefix} />
              <SlotMod label="접미" mod={suffix} />
              {slot?.comment && <p className="slot-comment">{slot.comment}</p>}
            </article>
          );
        })}
      </div>
      <div className="modal-actions sticky">
        {user && <button className="btn ghost" onClick={onClone}>이 세팅 복제</button>}
        <button className={cls("btn", favorite ? "primary" : "ghost")} onClick={() => onFavorite(build)}>
          {favorite ? "★ 즐겨찾기 해제" : "☆ 즐겨찾기"}
        </button>
      </div>
    </Modal>
  );
}

function SlotMod({ label, mod }) {
  if (!mod) {
    return <div className="slot-mod empty-mod"><span>{label}</span><strong>선택 없음</strong></div>;
  }
  return (
    <div className="slot-mod">
      <span>{label}</span>
      <strong>{mod.name}</strong>
      <small>{mod.category} · {mod.parts}</small>
      <ul>
        {optionLines(mod).map((line, i) => <li key={i}>{line.replace(/^\*/, "⚠ ")}</li>)}
      </ul>
    </div>
  );
}

function BuildEditor({ user, profile, modbooks, initialBuild, initialSlots, onClose, onSaved }) {
  const [form, setForm] = useState({
    title: initialBuild?.title ? `${initialBuild.title} 복제` : "",
    summary: initialBuild?.summary || "",
    description: initialBuild?.description || "",
    tags: (initialBuild?.tags || []).join(", ")
  });
  const [slots, setSlots] = useState(() => {
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

  const setField = (k, v) => setForm((prev) => ({ ...prev, [k]: v }));
  const setSlot = (slotKey, k, v) =>
    setSlots((prev) => ({
      ...prev,
      [slotKey]: { ...prev[slotKey], [k]: v }
    }));

  async function save() {
    if (!form.title.trim()) return setError("세팅 제목을 입력하세요.");
    setSaving(true);
    setError("");
    try {
      const tags = form.tags.split(",").map((v) => v.trim()).filter(Boolean).slice(0, 8);
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
        prefix_modbook_id: slots[meta.key].prefix_modbook_id
          ? Number(slots[meta.key].prefix_modbook_id)
          : null,
        suffix_modbook_id: slots[meta.key].suffix_modbook_id
          ? Number(slots[meta.key].suffix_modbook_id)
          : null,
        comment: slots[meta.key].comment.trim()
      }));

      const { error: slotError } = await supabase.from("build_slots").insert(slotRows);
      if (slotError) {
        await supabase.from("builds").delete().eq("id", build.id);
        throw slotError;
      }
      onSaved(build);
    } catch (e) {
      setError(e.message || "저장 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="추천세팅 작성" onClose={onClose} wide>
      <div className="form-grid">
        <label>
          <span>제목 *</span>
          <input value={form.title} onChange={(e) => setField("title", e.target.value)} placeholder="예: 이동속도 밸런스 세팅" />
        </label>
        <label>
          <span>한줄 설명</span>
          <input value={form.summary} onChange={(e) => setField("summary", e.target.value)} placeholder="목표와 특징을 짧게 설명" />
        </label>
        <label className="full">
          <span>상세 설명</span>
          <textarea value={form.description} onChange={(e) => setField("description", e.target.value)} placeholder="세팅 의도, 장단점, 사용 팁" />
        </label>
        <label className="full">
          <span>태그</span>
          <input value={form.tags} onChange={(e) => setField("tags", e.target.value)} placeholder="이동속도, 밸런스, 채광 (쉼표로 구분)" />
        </label>
      </div>

      <div className="editor-slots">
        {SLOT_META.map((meta) => {
          const candidates = modbooks.filter((m) => slotAllows(m, meta));
          const prefixes = candidates.filter((m) => m.type === "접두");
          const suffixes = candidates.filter((m) => m.type === "접미");
          return (
            <article className="editor-slot" key={meta.key}>
              <div className="slot-title"><span>{meta.label}</span><em>{meta.key.toUpperCase()}</em></div>
              <label>
                <span>접두 개조서</span>
                <select
                  value={slots[meta.key].prefix_modbook_id}
                  onChange={(e) => setSlot(meta.key, "prefix_modbook_id", e.target.value)}
                >
                  <option value="">선택 없음</option>
                  {prefixes.map((m) => <option key={m.id} value={m.id}>[{m.category}] {m.name}</option>)}
                </select>
              </label>
              <label>
                <span>접미 개조서</span>
                <select
                  value={slots[meta.key].suffix_modbook_id}
                  onChange={(e) => setSlot(meta.key, "suffix_modbook_id", e.target.value)}
                >
                  <option value="">선택 없음</option>
                  {suffixes.map((m) => <option key={m.id} value={m.id}>[{m.category}] {m.name}</option>)}
                </select>
              </label>
              <label>
                <span>부위 코멘트</span>
                <input
                  value={slots[meta.key].comment}
                  onChange={(e) => setSlot(meta.key, "comment", e.target.value)}
                  placeholder="선택 이유 또는 주의점"
                />
              </label>
            </article>
          );
        })}
      </div>

      {error && <div className="form-error">{error}</div>}
      <div className="modal-actions sticky">
        <button className="btn ghost" onClick={onClose}>취소</button>
        <button className="btn primary" onClick={save} disabled={saving}>{saving ? "저장 중..." : "게시하기"}</button>
      </div>
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
  const [modbooks, setModbooks] = useState([]);
  const [favorites, setFavorites] = useState(new Set());
  const [myReports, setMyReports] = useState([]);
  const [adminReports, setAdminReports] = useState([]);

  const [loading, setLoading] = useState(true);
  const [selectedBuild, setSelectedBuild] = useState(null);
  const [selectedSlots, setSelectedSlots] = useState([]);
  const [editor, setEditor] = useState(null);
  const [reportEditor, setReportEditor] = useState(false);
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
    const { data, error } = await supabase
      .from("builds")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) return notify(`추천세팅 로드 실패: ${error.message}`, "error");
    setBuilds(data || []);
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
    const { data, error } = await supabase
      .from("build_slots")
      .select("*")
      .eq("build_id", build.id)
      .order("id");
    if (error) notify(error.message, "error");
    setSelectedSlots(data || []);
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
          <Hero user={user} onCreate={() => setEditor({ build: null, slots: [] })} setTab={setTab} />
          <BuildsPage
            builds={builds}
            loading={loading}
            user={user}
            favorites={favorites}
            onOpen={openBuild}
            onFavorite={toggleFavorite}
            onCreate={() => setEditor({ build: null, slots: [] })}
          />
        </>
      )}
      {tab === "modbooks" && <ModbooksPage modbooks={modbooks} />}
      {tab === "reports" && (
        <ReportsPage user={user} myReports={myReports} onNewReport={() => setReportEditor(true)} />
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
