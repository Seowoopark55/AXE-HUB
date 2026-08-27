import React, { useEffect, useMemo, useState } from "react";
import { isSupabaseConfigured, supabase } from "./lib/supabase";

const SLOT_META = [
  { key: "outer", label: "겉옷", icon: "01", image: "/assets/equipment/outer-team.webp", keywords: ["겉옷", "단독상의"] },
  { key: "top", label: "상의", icon: "02", image: "/assets/equipment/top-team.webp", keywords: ["상의"] },
  { key: "bottom", label: "하의", icon: "03", image: "/assets/equipment/bottom-team.webp", keywords: ["하의"] },
  { key: "shoes", label: "신발", icon: "04", image: "/assets/equipment/shoes-team.webp", keywords: ["신발"] }
];

const BASE_CATEGORIES = ["전체", "인기", "무법지대", "체력", "이동속도", "생활"];
const LIFE_CATEGORIES = ["벌목", "낚시", "채광", "택배"];
const HIDDEN_TAGS = new Set(["AXE 추천", "AXE OFFICIAL", "공식", "밸런스"]);

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

function displayProfileName(profile, user) {
  return (
    profile?.approved_nickname ||
    profile?.display_name ||
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    "Discord User"
  );
}

function socialScore(build) {
  return (build?.like_count || 0) - (build?.dislike_count || 0);
}

function buildSearchText(build) {
  return [build?.title, build?.summary, build?.description, build?.author_name, ...visibleTags(build?.tags)]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function buildCategoryList() {
  return BASE_CATEGORIES;
}

function buildCategoryCorpus(build, slots, modMap) {
  const modText = (slots || [])
    .flatMap((slot) => [slot?.prefix_modbook_id, slot?.suffix_modbook_id])
    .map((id) => modMap.get(id))
    .filter(Boolean)
    .flatMap((mod) => [
      mod.name,
      mod.category,
      mod.parts,
      mod.option1,
      mod.option2,
      mod.option3,
      mod.note
    ])
    .filter(Boolean);

  return [
    build?.title,
    build?.summary,
    build?.description,
    build?.author_name,
    ...visibleTags(build?.tags),
    ...modText
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .replace(/\s+/g, "");
}

function buildMatchesCategory(build, slots, modMap, primary, lifeSecondary = "전체") {
  if (primary === "전체" || primary === "인기") return true;

  const corpus = buildCategoryCorpus(build, slots, modMap);

  if (primary === "무법지대") {
    return corpus.includes("무법지대") || corpus.includes("무법");
  }

  if (primary === "체력") {
    return corpus.includes("체력") || corpus.includes("생명력") || corpus.includes("최대체력");
  }

  if (primary === "이동속도") {
    return corpus.includes("이동속도") || corpus.includes("이속");
  }

  if (primary === "생활") {
    const hasLifeSub = LIFE_CATEGORIES.some((name) => corpus.includes(name.toLowerCase()));
    if (!hasLifeSub && !corpus.includes("생활")) return false;
    if (lifeSecondary === "전체") return true;
    return corpus.includes(String(lifeSecondary).toLowerCase());
  }

  return false;
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

function canonicalPresetOptionLabel(value) {
  const display = String(value || "").replace(/\s+/g, " ").trim();
  const key = display.replace(/\s+/g, "").toLowerCase();
  const aliases = {
    "이동속도증가": "이동 속도 증가",
    "최대스태미나증가": "최대 스태미나 증가",
    "최대체력증가": "최대 체력 증가",
    "전력질주스태미나감소": "전력질주 스태미나 감소",
  };
  return aliases[key] || display;
}

function parsePresetOptionExact(value) {
  const raw = String(value || "").trim();
  const negative = raw.startsWith("*");
  const clean = raw.replace(/^\*\s*/, "").trim();
  const match = clean.match(/^(.*?)\s*\(([^)]+)\)\s*$/);

  if (!match) {
    return {
      raw,
      negative,
      label: canonicalPresetOptionLabel(clean),
      range: "",
      value: null,
      unit: "",
      bestDisplay: "",
    };
  }

  const label = canonicalPresetOptionLabel(match[1]);
  const range = match[2].replace(/\s*~\s*/g, " ~ ").trim();
  const tokens = [...range.matchAll(/-?\d+(?:\.\d+)?\s*%?/g)]
    .map((entry) => entry[0].replace(/\s+/g, ""));
  const bestToken = tokens.length ? tokens[tokens.length - 1] : "";
  const unit = bestToken.endsWith("%") ? "%" : "";
  const numeric = Number(bestToken.replace("%", ""));

  return {
    raw,
    negative,
    label,
    range,
    value: Number.isFinite(numeric) ? numeric : null,
    unit,
    bestDisplay: bestToken,
  };
}

function cleanPresetModbookName(name) {
  return String(name || "")
    .replace(/\s*\(\s*1\s*\)\s*$/, "")
    .replace(/\s*1티어\s*$/, "")
    .trim();
}

function sumPresetMovement(mods) {
  return (mods || []).reduce((total, item) => {
    const options = [item?.option1, item?.option2, item?.option3]
      .filter(Boolean)
      .map(parsePresetOptionExact);
    const movement = options.find(
      (option) =>
        !option.negative &&
        option.label === "이동 속도 증가" &&
        option.value != null
    );
    return total + (movement?.value || 0);
  }, 0);
}

function formatPresetCompactNumber(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return "0";
  return Number.isInteger(number)
    ? String(number)
    : number.toFixed(1).replace(/\.0$/, "");
}

function summarizePresetExact(slots, modMap) {
  const totals = new Map();
  const negative = [];
  let movement = 0;

  for (const slot of slots || []) {
    for (const id of [slot?.prefix_modbook_id, slot?.suffix_modbook_id]) {
      const mod = modMap.get(id);
      if (!mod) continue;

      [mod.option1, mod.option2, mod.option3]
        .filter(Boolean)
        .forEach((value) => {
          const option = parsePresetOptionExact(value);
          if (option.value == null) return;

          if (option.negative) {
            negative.push(option);
            return;
          }

          const key = `${option.label}|${option.unit}`;
          const current = totals.get(key) || {
            label: option.label,
            unit: option.unit,
            value: 0,
          };
          current.value += option.value;
          totals.set(key, current);

          if (option.label === "이동 속도 증가") movement += option.value;
        });
    }
  }

  return {
    movement,
    positive: [...totals.values()].sort((a, b) => {
      if (a.label === "이동 속도 증가") return -1;
      if (b.label === "이동 속도 증가") return 1;
      return b.value - a.value;
    }),
    negative,
  };
}


function Toast({ message, tone = "default" }) {
  if (!message) return null;
  return <div className={cls("toast", tone === "error" && "error")}>{message}</div>;
}

function Modal({ title, children, onClose, wide = false, bare = false, className = "" }) {
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section
        className={cls("modal", wide && "wide", bare && "bare", className)}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {!bare && (
          <header className="modal-head">
            <div>
              <div className="eyebrow">AXE HUB</div>
              <h2>{title}</h2>
            </div>
            <button className="icon-btn" onClick={onClose} aria-label="닫기">
              ×
            </button>
          </header>
        )}
        {children}
      </section>
    </div>
  );
}

function Brand() {
  return (
    <div className="brand">
      <div className="brand-mark brand-logo-box">
        <img src="/assets/axe-logo.png" alt="AXE 로고" />
      </div>
      <div>
        <strong>AXE BUILD</strong>
        <span>AXE HUB · PUBLIC BUILD LAB</span>
      </div>
    </div>
  );
}

function Header({
  tab,
  setTab,
  user,
  profile,
  adminPendingCount = 0,
  onLogin,
  onLogout,
  onCreate,
  onProfile
}) {
  const displayName = displayProfileName(profile, user);
  return (
    <header className="topbar">
      <div className="shell topbar-inner">
        <button className="brand-btn" onClick={() => setTab("builds")} aria-label="AXE BUILD 홈">
          <Brand />
        </button>
        <nav className="nav">
          <button className={cls(tab === "notices" && "active")} onClick={() => setTab("notices")}>공지</button>
          <button className={cls(tab === "builds" && "active")} onClick={() => setTab("builds")}>추천세팅</button>
          {user && <button className={cls(tab === "presets" && "active")} onClick={() => setTab("presets")}>내 프리셋</button>}
          <button className={cls(tab === "modbooks" && "active")} onClick={() => setTab("modbooks")}>개조서</button>
          <button className={cls(tab === "reports" && "active")} onClick={() => setTab("reports")}>제보</button>
          {profile?.is_admin && (
            <button className={cls("admin-nav-btn", tab === "admin" && "active")} onClick={() => setTab("admin")}>
              관리
              {adminPendingCount > 0 && <span>{Math.min(adminPendingCount, 99)}</span>}
            </button>
          )}
        </nav>
        <div className="header-actions">
          {user && <button className="btn ghost compact desktop-only" onClick={() => setTab("presets")}>★ 내 프리셋</button>}
          {user && <button className="btn ghost compact desktop-only" onClick={onCreate}>+ 세팅 작성</button>}
          {user ? (
            <div className="user-chip">
              {profile?.avatar_url ? <img src={profile.avatar_url} alt="" /> : <div className="avatar-fallback">{displayName[0] || "?"}</div>}
              <div>
                <strong>{displayName}</strong>
                <div className="user-chip-actions"><button onClick={onProfile}>닉네임</button><button onClick={onLogout}>로그아웃</button></div>
              </div>
            </div>
          ) : <button className="btn discord" onClick={onLogin}>Discord로 계속하기</button>}
        </div>
      </div>
    </header>
  );
}

function Hero({ user, onCreate, onJump, onPresets }) {
  return (
    <section className="hero shell hero-simple">
      <div className="hero-copy">
        <div className="eyebrow gold">AXE BUILD · PUBLIC SETTING HUB</div>
        <h1>추천세팅을<br />가장 빠르게 찾는 곳.</h1>
        <p>
          장비 슬롯을 한눈에 확인하고 마우스를 올려 개조서 옵션을 바로 비교하세요.
          추천세팅과 개조서는 로그인 없이 볼 수 있고, 로그인하면 프리셋 저장·추천·댓글을 사용할 수 있습니다.
        </p>
        <div className="hero-actions">
          <button className="btn primary" onClick={onJump}>추천세팅 바로 보기</button>
          {user && <button className="btn ghost" onClick={onPresets}>★ 내 프리셋</button>}
          {user && <button className="btn ghost" onClick={onCreate}>세팅 작성</button>}
        </div>
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
        <div className="badges">{tags.map((tag) => <span className="badge" key={tag}>{tag}</span>)}</div>
        <button className={cls("preset-save-btn", favorite && "active")} onClick={(e) => { e.stopPropagation(); onFavorite(build); }} aria-label="내 프리셋 저장">
          {favorite ? "★ 프리셋" : "☆ 프리셋"}
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
              <div className="mini-slot-visual"><img src={meta.image} alt="" /></div>
              <div className="mini-slot-body">
                <div className="mini-slot-label"><strong>{meta.label}</strong></div>
                <div className="mini-slot-values">
                  <span className="prefix-text"><em>접두</em>{modName(slot?.prefix_modbook_id)}</span>
                  <span className="suffix-text"><em>접미</em>{modName(slot?.suffix_modbook_id)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="build-meta social-meta">
        <span>{build.author_name || "익명"}</span>
        <span className="like-stat">▲ {build.like_count || 0}</span>
        <span className="dislike-stat">▼ {build.dislike_count || 0}</span>
        <span>댓글 {build.comment_count || 0}</span>
        <span>조회 {build.view_count || 0}</span>
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
  const [lifeCategory, setLifeCategory] = useState("전체");
  const categories = useMemo(() => buildCategoryList(), []);

  const rows = useMemo(() => {
    let result = builds.filter((build) => {
      const hay = buildSearchText(build);
      const qOk = hay.includes(query.trim().toLowerCase());
      const categoryOk = buildMatchesCategory(
        build,
        buildSlotsMap[build.id] || [],
        modMap,
        categoryFilter,
        lifeCategory
      );
      return qOk && categoryOk;
    });

    result = [...result].sort((a, b) => {
      if (categoryFilter === "인기" || sort === "popular") {
        return socialScore(b) - socialScore(a) ||
          (b.like_count || 0) - (a.like_count || 0) ||
          (b.view_count || 0) - (a.view_count || 0) ||
          new Date(b.created_at) - new Date(a.created_at);
      }
      if (sort === "views") return (b.view_count || 0) - (a.view_count || 0);
      return new Date(b.created_at) - new Date(a.created_at);
    });
    return result;
  }, [builds, query, sort, categoryFilter, lifeCategory, buildSlotsMap, modMap]);

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
            onClick={() => {
              setCategoryFilter(category);
              if (category !== "생활") setLifeCategory("전체");
            }}
          >
            {category}
          </button>
        ))}
      </div>

      {categoryFilter === "생활" && (
        <div className="subcategory-strip" aria-label="생활 세부 카테고리">
          {["전체", ...LIFE_CATEGORIES].map((category) => (
            <button
              key={category}
              className={cls(lifeCategory === category && "active")}
              onClick={() => setLifeCategory(category)}
            >
              {category}
            </button>
          ))}
        </div>
      )}

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

function NoticeStrip({ announcements, onOpen }) {
  const notice = announcements.find((v) => v.is_pinned) || announcements[0];
  if (!notice) return null;
  return (
    <div className="shell notice-strip" onClick={onOpen} role="button" tabIndex={0}>
      <span className="notice-badge">공지</span>
      <strong>{notice.title}</strong>
      <p>{notice.body}</p>
      <em>{fmtDate(notice.created_at)} · 전체보기 →</em>
    </div>
  );
}

function PresetsPage({ user, builds, buildSlotsMap, modMap, favorites, onOpen, onFavorite, onLogin }) {
  if (!user) return (
    <section className="shell section"><div className="login-gate"><div><div className="eyebrow gold">MY PRESET</div><h3>내 프리셋은 Discord 로그인 후 사용할 수 있습니다.</h3><p>마음에 드는 추천세팅을 저장해두고 언제든 빠르게 다시 볼 수 있습니다.</p></div><button className="btn discord" onClick={onLogin}>Discord로 계속하기</button></div></section>
  );
  const rows = builds.filter((b) => favorites.has(b.id));
  return (
    <section className="shell section">
      <div className="section-head"><div><div className="eyebrow">MY PRESET</div><h2>내 프리셋</h2><p>저장한 세팅을 한 곳에서 관리합니다. 별표를 다시 누르면 프리셋에서 제거됩니다.</p></div><div className="stat-chip">{rows.length}</div></div>
      {rows.length ? <div className="build-grid">{rows.map((build) => <BuildCard key={build.id} build={build} slots={buildSlotsMap[build.id] || []} modMap={modMap} onOpen={onOpen} favorite={true} onFavorite={onFavorite} />)}</div> : <div className="empty">아직 저장한 프리셋이 없습니다. 추천세팅 우측 상단의 ☆ 프리셋을 눌러 저장해보세요.</div>}
    </section>
  );
}

function NoticesPage({
  announcements,
  profile,
  pendingNicknameCount = 0,
  onAnnouncementSave,
  onAnnouncementDelete,
  onOpenNicknameAdmin
}) {
  const [form, setForm] = useState({ title: "", body: "", is_pinned: false });
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!form.title.trim() || !form.body.trim()) return;
    setSaving(true);
    await onAnnouncementSave(form);
    setForm({ title: "", body: "", is_pinned: false });
    setSaving(false);
  };

  return (
    <section className="shell section notices-page-v113">
      <div className="section-head">
        <div>
          <div className="eyebrow">AXE HUB NOTICE</div>
          <h2>공지사항</h2>
          <p>변경사항, 이용 안내, 데이터 업데이트 소식을 확인할 수 있습니다.</p>
        </div>

        {profile?.is_admin ? (
          <button className="nickname-admin-shortcut" onClick={onOpenNicknameAdmin}>
            닉네임 승인
            <span>{pendingNicknameCount}</span>
          </button>
        ) : (
          <div className="nickname-admin-hidden-note">
            닉네임 승인 기능은 관리자 계정에서만 표시됩니다.
          </div>
        )}
      </div>

      {profile?.is_admin && (
        <section className="notice-compose-v113">
          <div className="notice-compose-head">
            <div>
              <span>ADMIN NOTICE</span>
              <strong>공지사항 작성</strong>
            </div>
            <label>
              <input
                type="checkbox"
                checked={form.is_pinned}
                onChange={(e) => setForm((prev) => ({ ...prev, is_pinned: e.target.checked }))}
              />
              상단 고정
            </label>
          </div>

          <input
            value={form.title}
            onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
            placeholder="공지 제목"
            maxLength={120}
          />
          <textarea
            value={form.body}
            onChange={(e) => setForm((prev) => ({ ...prev, body: e.target.value }))}
            placeholder="변경사항 또는 안내할 내용을 입력하세요."
            maxLength={3000}
          />
          <div className="notice-compose-actions">
            <small>관리자만 작성할 수 있습니다.</small>
            <button className="btn primary" onClick={submit} disabled={saving}>
              {saving ? "등록 중..." : "공지 등록"}
            </button>
          </div>
        </section>
      )}

      <div className="notice-list">
        {announcements.map((notice) => (
          <article className={cls("notice-card", notice.is_pinned && "pinned")} key={notice.id}>
            <div>
              <span>{notice.is_pinned ? "PINNED" : "NOTICE"}</span>
              <div className="notice-card-tools">
                <time>{fmtDate(notice.created_at)}</time>
                {profile?.is_admin && (
                  <button className="text-danger" onClick={() => onAnnouncementDelete(notice)}>
                    삭제
                  </button>
                )}
              </div>
            </div>
            <h3>{notice.title}</h3>
            <p>{notice.body}</p>
          </article>
        ))}
      </div>

      {!announcements.length && <div className="empty">등록된 공지가 없습니다.</div>}
    </section>
  );
}

function FloatingRemote({ announcements, onHome, onNotice, onReport, onPreset }) {
  const contact = String(import.meta.env.VITE_AXE_CONTACT_URL || "").trim();

  const recruitHeader = (
    <div className="remote-recruit-head">
      <span>AXE RECRUIT</span>
      <strong>AXE 인원모집 중</strong>
      <small>DM 문의 주세요.</small>
    </div>
  );

  return (
    <aside className="floating-remote-v112" aria-label="AXE HUB 빠른 메뉴">
      {contact ? (
        <a className="remote-recruit-link" href={contact} target="_blank" rel="noreferrer">
          {recruitHeader}
        </a>
      ) : recruitHeader}

      <div className="remote-menu-v112">
        <button onClick={onHome}>
          <span className="remote-icon">⌂</span>
          <b>홈</b>
        </button>
        <button onClick={onNotice}>
          <span className="remote-icon">!</span>
          <b>공지</b>
          {announcements.length > 0 && <span className="remote-dot">{Math.min(announcements.length, 9)}</span>}
        </button>
        <button onClick={onReport}>
          <span className="remote-icon">✎</span>
          <b>제보</b>
        </button>
        <button onClick={onPreset}>
          <span className="remote-icon">★</span>
          <b>내 프리셋</b>
        </button>
      </div>
    </aside>
  );
}


function FloatingContextPanel({
  tab,
  announcements,
  user,
  onHome,
  onNotice,
  onReport,
  onPreset,
  onRecruit
}) {
  const latestNotice = announcements?.[0] || null;
  const noticeCount = announcements?.length || 0;

  const quickItems = [
    { key: "builds", label: "홈", icon: "⌂", action: onHome },
    { key: "notices", label: "공지", icon: "!", action: onNotice, badge: noticeCount > 0 ? Math.min(noticeCount, 9) : null },
    { key: "reports", label: "제보", icon: "✎", action: onReport },
    { key: "presets", label: "내 프리셋", icon: "★", action: onPreset }
  ];

  const contextMap = {
    builds: {
      kicker: "BUILD STATUS",
      title: "추천세팅 탐색",
      body: "카테고리별 추천세팅을 빠르게 보고, 원하는 조합은 바로 내 프리셋으로 저장할 수 있습니다."
    },
    notices: {
      kicker: "LATEST NOTICE",
      title: latestNotice?.title || "최근 공지",
      body: latestNotice?.body || "업데이트와 이용 안내를 이곳에서 확인하세요."
    },
    reports: {
      kicker: "REPORT DESK",
      title: "제보로 데이터 보강",
      body: "누락된 개조서 정보와 잘못된 옵션을 제보하면 검수 후 반영됩니다."
    },
    presets: {
      kicker: "MY PRESET",
      title: user ? "저장한 프리셋 관리" : "로그인 후 내 프리셋 이용",
      body: user ? "즐겨찾기한 세팅과 직접 저장한 조합을 한 곳에서 다시 확인하세요." : "Discord 로그인 후 프리셋 저장과 댓글, 추천 기능을 사용할 수 있습니다."
    },
    modbooks: {
      kicker: "MODBOOK DATA",
      title: "개조서 확인",
      body: "부위별 개조서 옵션을 검색하고, 필요한 정보는 제보로 추가할 수 있습니다."
    },
    admin: {
      kicker: "ADMIN CENTER",
      title: "관리 작업",
      body: "공지, 닉네임 승인, 제보 검수를 이 영역에서 빠르게 확인할 수 있습니다."
    }
  };

  const current = contextMap[tab] || contextMap.builds;

  return (
    <aside className="floating-context-v116" aria-label="AXE HUB 빠른 메뉴와 모집 안내">
      <div className="floating-context-v116__recruit">
        <div className="floating-context-v116__recruit-copy">
          <span>AXE RECRUIT</span>
          <strong>AXE 인원모집 중</strong>
          <p>DM 문의 주세요.</p>
        </div>
        <button className="floating-context-v116__recruit-btn" type="button" onClick={onRecruit}>
          모집안내
        </button>
      </div>

      <div className="floating-context-v116__menu">
        {quickItems.map((item) => (
          <button
            key={item.key}
            type="button"
            className={cls("floating-context-v116__menu-btn", tab === item.key && "is-active")}
            onClick={item.action}
          >
            <span className="floating-context-v116__icon">{item.icon}</span>
            <b>{item.label}</b>
            {item.badge ? <em>{item.badge}</em> : null}
          </button>
        ))}
      </div>

      <div className="floating-context-v116__focus">
        <span>{current.kicker}</span>
        <strong>{current.title}</strong>
        <p>{current.body}</p>
      </div>
    </aside>
  );
}

function RecruitPosterModal({ onClose }) {
  const contact = String(import.meta.env.VITE_AXE_CONTACT_URL || "").trim();

  return (
    <Modal
      title="AXE 신규 인원 모집"
      onClose={onClose}
      className="recruit-poster-modal-v117"
    >
      <div className="recruit-poster-modal-v117__body">
        <img
          className="recruit-poster-modal-v117__image"
          src="/assets/axe-recruitment-poster.png"
          alt="AXE 신규 인원 모집 포스터"
        />

        <div className="recruit-poster-modal-v117__actions">
          <span>총싸움 · 성실함 · 의리</span>
          <div>
            {contact && (
              <a className="btn primary" href={contact} target="_blank" rel="noreferrer">
                DM 문의
              </a>
            )}
            <button className="btn ghost" type="button" onClick={onClose}>
              닫기
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function ProfileModal({ user, profile, request, onClose, onRequest }) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    await onRequest(name.trim());
    setSaving(false);
    setName("");
  };
  return (
    <Modal title="닉네임 설정" onClose={onClose}>
      <div className="nickname-panel">
        <div className="nickname-current"><span>현재 표시 이름</span><strong>{displayProfileName(profile, user)}</strong><small>{profile?.approved_nickname ? "관리자 승인 닉네임" : "Discord 표시 이름"}</small></div>
        <div className="nickname-explain"><strong>닉네임은 신청/승인제로 운영합니다.</strong><p>타인 사칭과 혼동을 줄이기 위해 신청 후 관리자가 확인합니다. 승인되면 이후 작성글과 댓글에 해당 닉네임이 표시됩니다.</p></div>
        {request?.status === "pending" && <div className="nickname-status pending"><span>승인 대기</span><strong>{request.requested_name}</strong></div>}
        {request?.status === "rejected" && <div className="nickname-status rejected"><span>최근 신청 반려</span><strong>{request.requested_name}</strong><p>{request.admin_note || "관리자 메모 없음"}</p></div>}
        <label className="nickname-input"><span>신청할 닉네임</span><input value={name} maxLength={16} onChange={(e) => setName(e.target.value)} placeholder="2~16자" /></label>
        <div className="modal-actions inline-actions"><button className="btn primary" onClick={submit} disabled={saving}>{saving ? "신청 중..." : "닉네임 신청"}</button></div>
      </div>
    </Modal>
  );
}

function Promo() { return null; }

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
    <section className="shell section reports-page">
      <div className="report-hero">
        <div><div className="eyebrow gold">HELP AXE BUILD</div><h2>새 개조서를 발견했거나<br />옵션이 잘못되어 있나요?</h2><p>제보 하나가 전체 추천세팅의 정확도를 올립니다. 스크린샷이 있으면 같이 첨부해주세요.</p></div>
        {user ? <button className="btn primary report-cta" onClick={onNewReport}>+ 지금 제보하기</button> : <button className="btn discord report-cta" onClick={onLogin}>로그인하고 제보하기</button>}
      </div>
      <div className="report-guide">
        <div className="guide-card"><span>01</span><strong>누락 제보</strong><p>도감에 없는 새로운 개조서를 등록합니다.</p></div>
        <div className="guide-card"><span>02</span><strong>수정 제보</strong><p>수치·부위·옵션이 다를 때 기존 정보를 수정 요청합니다.</p></div>
        <div className="guide-card"><span>03</span><strong>검수 반영</strong><p>관리자 승인 후 개조서 DB에 자동으로 반영됩니다.</p></div>
      </div>
      {user && <div className="subsection-title"><div><span>MY REPORTS</span><h3>내 제보 현황</h3></div><div className="report-count">{myReports.length}</div></div>}
      {user ? (myReports.length ? <div className="report-list">{myReports.map((r) => <article className="report-row" key={r.id}><div><span className={cls("status", r.status)}>{r.status}</span><strong>{r.name}</strong><span>{r.mod_type} · {r.category || "기타"}</span></div><time>{fmtDate(r.created_at)}</time></article>)}</div> : <div className="empty">아직 등록한 제보가 없습니다.</div>) : <div className="login-gate compact-login-gate"><p>추천세팅과 개조서는 로그인 없이 볼 수 있습니다. 제보 등록만 작성자 식별을 위해 Discord 로그인이 필요합니다.</p></div>}
    </section>
  );
}

function AdminPage({
  profile,
  reports,
  nicknameRequests,
  announcements,
  initialMode = "nicknames",
  onApprove,
  onReject,
  onNicknameReview,
  onAnnouncementSave,
  onAnnouncementDelete
}) {
  const [mode, setMode] = useState(initialMode);

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);
  const [noticeForm, setNoticeForm] = useState({ title: "", body: "", is_pinned: false });
  if (!profile?.is_admin) return <section className="shell section"><div className="empty">관리자 권한이 없습니다.</div></section>;
  const pending = reports.filter((r) => r.status === "pending");
  const pendingNames = nicknameRequests.filter((r) => r.status === "pending");
  const saveNotice = async () => {
    if (!noticeForm.title.trim() || !noticeForm.body.trim()) return;
    await onAnnouncementSave(noticeForm);
    setNoticeForm({ title: "", body: "", is_pinned: false });
  };
  return (
    <section className="shell section admin-page">
      <div className="section-head"><div><div className="eyebrow">AXE HUB ADMIN</div><h2>관리 센터</h2><p>제보 검수, 닉네임 승인, 공지사항을 한 곳에서 관리합니다.</p></div></div>
      <div className="admin-tabs">
        <button className={cls(mode === "reports" && "active")} onClick={() => setMode("reports")}>개조서 제보 <span>{pending.length}</span></button>
        <button className={cls(mode === "nicknames" && "active")} onClick={() => setMode("nicknames")}>닉네임 신청 <span>{pendingNames.length}</span></button>
        <button className={cls(mode === "notices" && "active")} onClick={() => setMode("notices")}>공지사항 <span>{announcements.length}</span></button>
      </div>
      {mode === "reports" && <div className="admin-list">{pending.map((r) => <article className="admin-card" key={r.id}><div className="admin-card-head"><div><span className="status pending">pending</span><h3>{r.name}</h3></div><span>{r.mod_type} · {r.category || "기타"}</span></div><dl><div><dt>부위</dt><dd>{r.parts || "-"}</dd></div><div><dt>옵션</dt><dd className="preline">{r.options_text || "-"}</dd></div><div><dt>메모</dt><dd>{r.note || "-"}</dd></div></dl><div className="admin-actions"><button className="btn ghost" onClick={() => onReject(r)}>반려</button><button className="btn primary" onClick={() => onApprove(r)}>승인</button></div></article>)}</div>}
      {mode === "reports" && !pending.length && <div className="empty">대기 중인 개조서 제보가 없습니다.</div>}
      {mode === "nicknames" && <div className="admin-list">{pendingNames.map((r) => <article className="admin-card nickname-admin-card" key={r.id}><div className="admin-card-head"><div><span className="status pending">pending</span><h3>{r.current_name || "Discord 사용자"} <span className="nickname-arrow">→</span> {r.requested_name}</h3></div><span>{fmtDate(r.created_at)}</span></div><p className="nickname-review-explain">승인하면 이후 추천세팅·댓글·제보에서 이 닉네임이 표시됩니다.</p><div className="admin-actions"><button className="btn ghost" onClick={() => onNicknameReview(r, false)}>반려</button><button className="btn primary" onClick={() => onNicknameReview(r, true)}>승인</button></div></article>)}</div>}
      {mode === "nicknames" && !pendingNames.length && <div className="empty">대기 중인 닉네임 신청이 없습니다.</div>}
      {mode === "notices" && <><div className="notice-admin-form"><input value={noticeForm.title} onChange={(e) => setNoticeForm((p) => ({ ...p, title: e.target.value }))} placeholder="공지 제목" /><textarea value={noticeForm.body} onChange={(e) => setNoticeForm((p) => ({ ...p, body: e.target.value }))} placeholder="공지 내용" /><label><input type="checkbox" checked={noticeForm.is_pinned} onChange={(e) => setNoticeForm((p) => ({ ...p, is_pinned: e.target.checked }))} /> 상단 고정</label><button className="btn primary" onClick={saveNotice}>공지 등록</button></div><div className="notice-list admin-notice-list">{announcements.map((n) => <article className="notice-card" key={n.id}><div><span>{n.is_pinned ? "PINNED" : "NOTICE"}</span><button className="text-danger" onClick={() => onAnnouncementDelete(n)}>삭제</button></div><h3>{n.title}</h3><p>{n.body}</p></article>)}</div></>}
    </section>
  );
}

function BuildDetail({
  build,
  slots,
  modMap,
  favorite,
  user,
  profile,
  userVote,
  comments,
  onFavorite,
  onVote,
  onComment,
  onDeleteComment,
  onLogin,
  onClose,
  onClone,
  onEdit,
  onDelete
}) {
  const [commentText, setCommentText] = useState("");
  const [commentBusy, setCommentBusy] = useState(false);
  const [selectedSlotKey, setSelectedSlotKey] = useState("bottom");

  const tags = visibleTags(build.tags);
  const summary = summarizePresetExact(slots, modMap);

  const canManage = Boolean(
    user && (profile?.is_admin || (build.author_id && build.author_id === user.id))
  );

  const getSlot = (slotKey) =>
    slots.find((slot) => String(slot.slot_key) === String(slotKey)) || {};

  const getMods = (slot) =>
    [modMap.get(slot?.prefix_modbook_id), modMap.get(slot?.suffix_modbook_id)]
      .filter(Boolean);

  const submitComment = async () => {
    if (!commentText.trim()) return;
    setCommentBusy(true);
    await onComment(commentText.trim());
    setCommentText("");
    setCommentBusy(false);
  };

  const GhostSlots = () => {
    const ghosts = [
      ["ghost-a", "좌측 슬롯"],
      ["ghost-b", "안경 슬롯"],
      ["ghost-c", "모자 슬롯"],
      ["ghost-d", "마스크 슬롯"],
      ["ghost-e", "목 슬롯"],
      ["ghost-f", "기타 슬롯"],
      ["ghost-g", "기타 슬롯"],
    ];
    return ghosts.map(([key, label]) => (
      <span
        className={`ops-info-preset-ghost ops-info-preset-ghost--${key}`}
        aria-hidden="true"
        title={label}
        key={key}
      />
    ));
  };

  const PresetMod = ({ mod }) => {
    if (!mod) return null;

    const typeClass = mod.type === "접두" ? "is-prefix" : "is-suffix";
    const options = [mod.option1, mod.option2, mod.option3]
      .filter((value) => String(value || "").trim())
      .map(parsePresetOptionExact);

    return (
      <section className={`ops-info-preset-mod ${typeClass}`}>
        <header>
          <strong>{cleanPresetModbookName(mod.name)}</strong>
          <span>{mod.type}</span>
        </header>
        <div className="ops-info-preset-mod__options">
          {options.map((option, idx) => (
            <div className={option.negative ? "is-negative" : ""} key={`${mod.id}-${idx}`}>
              <b>{option.bestDisplay || "—"}</b>
              <span>{option.label}</span>
              {option.range && <small>({option.range})</small>}
            </div>
          ))}
        </div>
      </section>
    );
  };

  const PresetTooltip = ({ slotKey, mobile = false }) => {
    const meta = SLOT_META.find((item) => item.key === slotKey);
    const slot = getSlot(slotKey);
    const mods = getMods(slot);
    const movement = sumPresetMovement(mods);

    return (
      <div
        className={cls(
          "ops-info-preset-tooltip",
          `ops-info-preset-tooltip--${slotKey}`,
          mobile && "is-mobile"
        )}
        role={mobile ? "region" : "tooltip"}
      >
        <div className="ops-info-preset-tooltip__head">
          <div>
            <span>{build.title}</span>
            <strong>{meta?.label || slotKey}</strong>
          </div>
          {movement > 0 && <b>+{formatPresetCompactNumber(movement)}%</b>}
        </div>

        {mods.map((mod) => <PresetMod mod={mod} key={mod.id} />)}

        {!mods.length && (
          <div className="ops-info-preset-emptyhint">
            선택된 개조서가 없습니다.
          </div>
        )}

        {slot?.comment && (
          <div className="ops-info-preset-emptyhint">{slot.comment}</div>
        )}

        <small>표시 수치 = 해당 옵션의 최대값 · 괄호 = 실제 등장 범위</small>
      </div>
    );
  };

  const PresetSlot = ({ slotKey }) => {
    const meta = SLOT_META.find((item) => item.key === slotKey);
    const slot = getSlot(slotKey);
    const movement = sumPresetMovement(getMods(slot));
    const selected = selectedSlotKey === slotKey;

    return (
      <div
        className={cls(
          "ops-info-preset-slot-wrap",
          `ops-info-preset-slot-wrap--${slotKey}`,
          selected && "is-selected"
        )}
      >
        <button
          className={cls("ops-info-preset-slot", selected && "is-selected")}
          type="button"
          onClick={() => setSelectedSlotKey(slotKey)}
          aria-label={`${meta?.label || slotKey} 추천 개조서`}
        >
          <span className="ops-info-preset-slot__frame">
            <img src={meta?.image} alt="" loading="lazy" draggable="false" />
          </span>
          <span className="ops-info-preset-slot__label">{meta?.label}</span>
          {movement > 0 && <em>+{formatPresetCompactNumber(movement)}%</em>}
        </button>

        <PresetTooltip slotKey={slotKey} />
      </div>
    );
  };

  return (
    <Modal
      title={build.title}
      onClose={onClose}
      wide
      bare
      className="preset-detail-modal-v112"
    >
      <section className="ops-info-workspace--preset-detail">
        <article className="ops-info-preset-article">
          <header className="ops-info-preset-article__head">
            <div>
              <span className="ops-info-kicker">
                {build.author_id ? "MEMBER BUILD" : "BUILD"}
              </span>
              <h2>{build.title}</h2>
              <div className="ops-info-preset-article__meta">
                <span>{build.author_name || "AXE"}</span>
                <span>{fmtDate(build.updated_at || build.created_at)}</span>
                <span>★ {build.favorite_count || 0}</span>
                <span>조회 {build.view_count || 0}</span>
              </div>
            </div>

            <div className="ops-info-preset-article__actions">
              <button
                type="button"
                className={cls("ops-info-btn", favorite && "ops-info-btn--saved")}
                onClick={() => onFavorite(build)}
              >
                {favorite ? "★ 저장됨" : "☆ 내 프리셋"}
              </button>

              {user && (
                <button type="button" className="ops-info-btn" onClick={onClone}>
                  복제해서 작성
                </button>
              )}

              {canManage && (
                <>
                  <button type="button" className="ops-info-btn" onClick={() => onEdit(build, slots)}>
                    수정
                  </button>
                  <button type="button" className="ops-info-btn ops-info-btn--danger" onClick={() => onDelete(build)}>
                    삭제
                  </button>
                </>
              )}

              <button type="button" className="ops-info-btn" onClick={onClose}>
                닫기
              </button>
            </div>
          </header>

          {tags.length > 0 && (
            <div className="ops-info-preset-article__tags">
              {tags.map((tag) => <span key={tag}>#{tag}</span>)}
            </div>
          )}

          <div className="ops-info-preset-article__description">
            {build.description || build.summary || (
              <span className="is-empty">설명이 없습니다.</span>
            )}
          </div>

          <div className="ops-info-preset-article__build-layout">
            <div className="ops-info-preset-inventory ops-info-preset-inventory--article">
              <div className="ops-info-preset-inventory__bar">
                <strong>인벤토리</strong>
                <span>장비 <b>1</b></span>
                <em>AXE BUILD</em>
              </div>

              <div className="ops-info-preset-board">
                {SLOT_META.map((meta) => (
                  <PresetSlot slotKey={meta.key} key={meta.key} />
                ))}
              </div>

              <div className="ops-info-preset-mobile-detail">
                <PresetTooltip slotKey={selectedSlotKey} mobile />
              </div>
            </div>

            <section className="ops-info-preset-aggregate ops-info-preset-aggregate--side">
              <div className="ops-info-preset-aggregate__head">
                <div>
                  <span className="ops-info-kicker">MAX ROLL SUMMARY</span>
                  <h3>전체 옵션 요약</h3>
                </div>
                <small>최대값 합산</small>
              </div>

              <div className="ops-info-preset-summary__stats">
                {summary.positive.length ? (
                  summary.positive.slice(0, 10).map((item) => (
                    <div
                      className={item.label === "이동 속도 증가" ? "is-primary" : ""}
                      key={`${item.label}-${item.unit}`}
                    >
                      <span>{item.label}</span>
                      <strong>
                        +{item.unit === "%"
                          ? `${formatPresetCompactNumber(item.value)}%`
                          : formatPresetCompactNumber(item.value)}
                      </strong>
                    </div>
                  ))
                ) : (
                  <div className="ops-info-preset-aggregate__empty">
                    합산 가능한 옵션이 없습니다.
                  </div>
                )}
              </div>

              {summary.negative.length > 0 && (
                <div className="ops-info-preset-warning">
                  <strong>주의 옵션</strong>
                  {summary.negative.slice(0, 5).map((item, idx) => (
                    <span key={`${item.label}-${idx}`}>
                      {item.label} {item.range}
                    </span>
                  ))}
                </div>
              )}

              <div className="ops-info-preset-slot-notes is-compact">
                <h3>부위별 코멘트</h3>
                {SLOT_META.map((meta) => {
                  const note = getSlot(meta.key)?.comment;
                  if (!note) return null;
                  return (
                    <div key={meta.key}>
                      <strong>{meta.label}</strong>
                      <p>{note}</p>
                    </div>
                  );
                })}
              </div>

              <p className="ops-info-preset-aggregate__hint">
                장비 부위에 마우스를 올리면 해당 부위의 접두·접미 옵션을 자세히 볼 수 있습니다.
              </p>
            </section>
          </div>

          <div className="social-action-row preset-social-row-v112">
            <button
              className={cls("vote-btn like", userVote === 1 && "active")}
              onClick={() => user ? onVote(userVote === 1 ? 0 : 1) : onLogin()}
            >
              ▲ 추천 <strong>{build.like_count || 0}</strong>
            </button>
            <button
              className={cls("vote-btn dislike", userVote === -1 && "active")}
              onClick={() => user ? onVote(userVote === -1 ? 0 : -1) : onLogin()}
            >
              ▼ 비추천 <strong>{build.dislike_count || 0}</strong>
            </button>
            <span className="comment-count-chip">
              댓글 {build.comment_count || comments.length || 0}
            </span>
          </div>

          <section className="comments-section preset-comments-v112">
            <div className="comments-head">
              <div><span>BUILD TALK</span><h3>댓글</h3></div>
              <strong>{comments.length}</strong>
            </div>

            {user ? (
              <div className="comment-write">
                <textarea
                  value={commentText}
                  maxLength={500}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="이 세팅을 써본 느낌이나 보완점을 남겨주세요."
                />
                <button className="btn primary" onClick={submitComment} disabled={commentBusy}>
                  {commentBusy ? "등록 중..." : "댓글 등록"}
                </button>
              </div>
            ) : (
              <button className="comment-login" onClick={onLogin}>
                댓글을 남기려면 Discord 로그인
              </button>
            )}

            <div className="comment-list">
              {comments.map((comment) => (
                <article className="comment-row" key={comment.id}>
                  <div className="comment-meta">
                    <strong>{comment.author_name}</strong>
                    <span>{fmtDate(comment.created_at)}</span>
                  </div>
                  <p>{comment.body}</p>
                  {user && (profile?.is_admin || comment.user_id === user.id) && (
                    <button className="comment-delete" onClick={() => onDeleteComment(comment)}>
                      삭제
                    </button>
                  )}
                </article>
              ))}
            </div>

            {!comments.length && (
              <div className="comment-empty">첫 댓글을 남겨보세요.</div>
            )}
          </section>
        </article>
      </section>
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
  const categories = useMemo(
    () => [...new Set(candidates.map((m) => m.category).filter(Boolean))].sort(),
    [candidates]
  );
  const filtered = useMemo(() => candidates.filter((m) => {
    if (category !== "전체 분류" && m.category !== category) return false;
    const hay = [m.name, m.category, m.parts, ...optionLines(m)].join(" ").toLowerCase();
    return hay.includes(query.trim().toLowerCase());
  }), [candidates, category, query]);

  const selectedMod = candidates.find((m) => String(m.id) === String(value)) || null;

  return (
    <div className={cls("modifier-picker", type === "접두" ? "prefix-picker" : "suffix-picker")}>
      <div className="modifier-picker-head">
        <strong>{type}</strong>
        <span>{candidates.length}개</span>
      </div>

      <div className="modifier-picker-filters">
        <label>
          <span>분류</span>
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option>전체 분류</option>
            {categories.map((v) => <option key={v}>{v}</option>)}
          </select>
        </label>
        <label>
          <span>검색</span>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="개조서명 / 옵션 검색" />
        </label>
      </div>

      <label className="modifier-select">
        <span>선택</span>
        <select value={value || ""} onChange={(e) => onChange(e.target.value)}>
          <option value="">선택 안 함</option>
          {filtered.map((m) => <option key={m.id} value={m.id}>[{m.category}] {m.name}</option>)}
        </select>
      </label>

      {selectedMod && (
        <div className="picker-selected-options">
          <strong>{selectedMod.name}</strong>
          {optionLines(selectedMod).map((line, idx) => (
            <span key={`${selectedMod.id}-${idx}`}>{line.replace(/^\*/, "⚠ ")}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function BuildEditor({
  user,
  profile,
  modbooks,
  initialBuild,
  initialSlots,
  mode = "create",
  onClose,
  onSaved
}) {
  const isEdit = mode === "edit";
  const isClone = mode === "clone";
  const isCreate = mode === "create";

  const draftKey = `axe-build-draft-${user?.id || "guest"}`;
  const initial = useMemo(() => {
    try {
      if (isCreate) {
        const saved = localStorage.getItem(draftKey);
        if (saved) return JSON.parse(saved);
      }
    } catch {}
    return null;
  }, [draftKey, isCreate]);

  const [form, setForm] = useState(initial?.form || {
    title: isClone && initialBuild?.title
      ? `${initialBuild.title} 복제`
      : (initialBuild?.title || ""),
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
    if (!isCreate) return;
    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem(draftKey, JSON.stringify({ form, slots }));
      } catch {}
    }, 250);
    return () => window.clearTimeout(timer);
  }, [form, slots, isCreate, draftKey]);

  const setField = (k, v) => setForm((prev) => ({ ...prev, [k]: v }));
  const setSlot = (slotKey, k, v) =>
    setSlots((prev) => ({ ...prev, [slotKey]: { ...prev[slotKey], [k]: v } }));

  async function save() {
    if (!form.title.trim()) return setError("세팅 제목을 입력하세요.");

    setSaving(true);
    setError("");

    try {
      const tags = form.tags
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean)
        .filter((v) => !HIDDEN_TAGS.has(v))
        .slice(0, 8);

      const payload = {
        title: form.title.trim(),
        summary: form.summary.trim(),
        description: form.description.trim(),
        tags,
        is_published: true
      };

      let build;

      if (isEdit) {
        const { data, error: buildError } = await supabase
          .from("builds")
          .update(payload)
          .eq("id", initialBuild.id)
          .select("*")
          .single();

        if (buildError) throw buildError;
        build = data;

        for (const meta of SLOT_META) {
          const original = (initialSlots || []).find((s) => s.slot_key === meta.key);
          const slotPayload = {
            prefix_modbook_id: slots[meta.key].prefix_modbook_id
              ? Number(slots[meta.key].prefix_modbook_id)
              : null,
            suffix_modbook_id: slots[meta.key].suffix_modbook_id
              ? Number(slots[meta.key].suffix_modbook_id)
              : null,
            comment: slots[meta.key].comment.trim()
          };

          if (original?.id) {
            const { error: slotError } = await supabase
              .from("build_slots")
              .update(slotPayload)
              .eq("id", original.id);
            if (slotError) throw slotError;
          } else {
            const { error: slotError } = await supabase
              .from("build_slots")
              .insert({
                build_id: build.id,
                slot_key: meta.key,
                ...slotPayload
              });
            if (slotError) throw slotError;
          }
        }
      } else {
        const { data, error: buildError } = await supabase
          .from("builds")
          .insert({
            ...payload,
            author_id: user.id,
            author_name: displayProfileName(profile, user),
            is_official: false
          })
          .select("*")
          .single();

        if (buildError) throw buildError;
        build = data;

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
      }

      if (isCreate) {
        try { localStorage.removeItem(draftKey); } catch {}
      }

      onSaved(build, isEdit ? "edit" : "create");
    } catch (e) {
      setError(e.message || (isEdit ? "수정 중 오류가 발생했습니다." : "저장 중 오류가 발생했습니다."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={isEdit ? "추천세팅 수정" : "추천세팅 작성"} onClose={onClose} wide>
      {isCreate && (
        <div className="draft-banner">
          <strong>작성 내용 자동 임시저장</strong>
          <span>브라우저를 닫거나 새로고침해도 작성 중인 내용이 복원됩니다.</span>
        </div>
      )}

      <div className="form-grid legacy-form-top">
        <label className="full">
          <span>제목</span>
          <input
            value={form.title}
            onChange={(e) => setField("title", e.target.value)}
            placeholder="예: 이동속도 1티어 / 무법 생존 세팅"
          />
        </label>
        <label className="full">
          <span>태그</span>
          <input
            value={form.tags}
            onChange={(e) => setField("tags", e.target.value)}
            placeholder="무법지대, 체력, 이동속도, 생활, 벌목, 낚시, 채광, 택배 (쉼표 구분)"
          />
        </label>
        <label className="full">
          <span>설명</span>
          <textarea
            value={form.description}
            onChange={(e) => setField("description", e.target.value)}
            placeholder="이 조합을 추천하는 이유, 실제 사용감, 주의점 등을 적어주세요."
          />
        </label>
        <label className="full compact-summary-field">
          <span>한줄 요약</span>
          <input
            value={form.summary}
            onChange={(e) => setField("summary", e.target.value)}
            placeholder="목록에서 보일 짧은 설명"
          />
        </label>
      </div>

      <div className="legacy-editor-grid">
        {SLOT_META.map((meta) => (
          <section className="legacy-slot-editor" key={meta.key}>
            <div className="legacy-slot-head">
              <div className="slot-thumb">
                <img src={meta.image} alt={`${meta.label} AXE 팀복`} />
              </div>
              <div>
                <small>장비 부위</small>
                <strong>{meta.label}</strong>
                <span>접두·접미 개조서를 선택합니다.</span>
              </div>
            </div>

            <ModifierPicker
              type="접두"
              slotMeta={meta}
              modbooks={modbooks}
              value={slots[meta.key].prefix_modbook_id}
              onChange={(v) => setSlot(meta.key, "prefix_modbook_id", v)}
            />
            <ModifierPicker
              type="접미"
              slotMeta={meta}
              modbooks={modbooks}
              value={slots[meta.key].suffix_modbook_id}
              onChange={(v) => setSlot(meta.key, "suffix_modbook_id", v)}
            />

            <label className="slot-comment-editor">
              <span>부위 설명</span>
              <textarea
                value={slots[meta.key].comment}
                onChange={(e) => setSlot(meta.key, "comment", e.target.value)}
                placeholder="이 부위 조합을 선택한 이유"
              />
            </label>
          </section>
        ))}
      </div>

      <div className="editor-standard">
        <strong>작성 기준</strong>
        <span>AXE HUB에 등록된 개조서 옵션을 사용하며 상세 화면에는 선택한 옵션과 최대값 요약을 함께 표시합니다.</span>
      </div>

      {error && <div className="form-error">{error}</div>}

      <div className="modal-actions sticky">
        <button className="btn ghost" onClick={onClose}>취소</button>
        <button className="btn primary" onClick={save} disabled={saving}>
          {saving ? "저장 중..." : (isEdit ? "수정 저장" : "게시하기")}
        </button>
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
  const [buildSlotsMap, setBuildSlotsMap] = useState({});
  const [modbooks, setModbooks] = useState([]);
  const [favorites, setFavorites] = useState(new Set());
  const [myReports, setMyReports] = useState([]);
  const [adminReports, setAdminReports] = useState([]);
  const [userVotes, setUserVotes] = useState(new Map());
  const [announcements, setAnnouncements] = useState([]);
  const [nicknameRequest, setNicknameRequest] = useState(null);
  const [adminNicknameRequests, setAdminNicknameRequests] = useState([]);

  const [loading, setLoading] = useState(true);
  const [selectedBuild, setSelectedBuild] = useState(null);
  const [selectedSlots, setSelectedSlots] = useState([]);
  const [selectedComments, setSelectedComments] = useState([]);
  const [editor, setEditor] = useState(null);
  const [reportEditor, setReportEditor] = useState(false);
  const [profileModal, setProfileModal] = useState(false);
  const [recruitModal, setRecruitModal] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState("전체");
  const [adminMode, setAdminMode] = useState("nicknames");
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

    Promise.all([loadBuilds(), loadModbooks(), loadAnnouncements()]).finally(() => {
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
      setUserVotes(new Map());
      setNicknameRequest(null);
      setAdminNicknameRequests([]);
      loadAnnouncements();
      return;
    }
    loadUserData(user.id);
  }, [user?.id]);

  useEffect(() => {
    if (profile?.is_admin) loadAdminData();
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
    const [{ data: p }, { data: fav }, { data: reports }, { data: votes }, { data: nick }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
      supabase.from("favorites").select("build_id").eq("user_id", userId),
      supabase.from("modbook_reports").select("*").eq("reporter_id", userId).order("created_at", { ascending: false }),
      supabase.from("build_votes").select("build_id,value").eq("user_id", userId),
      supabase.from("nickname_requests").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle()
    ]);
    setProfile(p || null);
    setFavorites(new Set((fav || []).map((f) => f.build_id)));
    setMyReports(reports || []);
    setUserVotes(new Map((votes || []).map((v) => [v.build_id, v.value])));
    setNicknameRequest(nick || null);
  }

  async function loadAnnouncements() {
    const { data, error } = await supabase.from("announcements").select("*").eq("is_published", true).order("is_pinned", { ascending: false }).order("created_at", { ascending: false });
    if (error) return notify(`공지 로드 실패: ${error.message}`, "error");
    setAnnouncements(data || []);
  }

  async function loadAdminData() {
    const [{ data: reports, error: reportError }, { data: names, error: nameError }, { data: notices, error: noticeError }] = await Promise.all([
      supabase.from("modbook_reports").select("*").order("created_at", { ascending: false }),
      supabase.from("nickname_requests").select("*").order("created_at", { ascending: false }),
      supabase.from("announcements").select("*").order("is_pinned", { ascending: false }).order("created_at", { ascending: false })
    ]);
    const error = reportError || nameError || noticeError;
    if (error) return notify(error.message, "error");
    setAdminReports(reports || []);
    setAdminNicknameRequests(names || []);
    setAnnouncements(notices || []);
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

  async function openBuild(build, countView = true) {
    setSelectedBuild(build);
    const [{ data: slots, error: slotError }, { data: comments, error: commentError }] = await Promise.all([
      supabase.from("build_slots").select("*").eq("build_id", build.id).order("id"),
      supabase.from("build_comments").select("*").eq("build_id", build.id).order("created_at", { ascending: true })
    ]);
    if (slotError) notify(slotError.message, "error");
    if (commentError) notify(commentError.message, "error");
    setSelectedSlots(slots || []);
    setSelectedComments(comments || []);
    if (countView) supabase.rpc("increment_build_view", { p_build_id: build.id }).then(() => loadBuilds());
  }

  async function toggleFavorite(build) {
    if (!user) return notify("내 프리셋 저장은 Discord 로그인 후 사용할 수 있습니다.", "error");
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

  async function voteBuild(build, value) {
    if (!user) return login();
    const { error } = await supabase.rpc("set_build_vote", { p_build_id: build.id, p_value: value });
    if (error) return notify(`추천 처리 실패: ${error.message}`, "error");
    const next = new Map(userVotes);
    if (value === 0) next.delete(build.id); else next.set(build.id, value);
    setUserVotes(next);
    await loadBuilds();
    const { data: refreshed } = await supabase.from("builds").select("*").eq("id", build.id).maybeSingle();
    if (refreshed) setSelectedBuild((prev) => prev?.id === build.id ? refreshed : prev);
  }

  async function addComment(body) {
    if (!user || !selectedBuild) return login();
    const { error } = await supabase.from("build_comments").insert({ build_id: selectedBuild.id, user_id: user.id, author_name: displayProfileName(profile, user), body });
    if (error) return notify(`댓글 등록 실패: ${error.message}`, "error");
    await openBuild(selectedBuild, false);
    await loadBuilds();
  }

  async function deleteComment(comment) {
    const { error } = await supabase.from("build_comments").delete().eq("id", comment.id);
    if (error) return notify(`댓글 삭제 실패: ${error.message}`, "error");
    await openBuild(selectedBuild, false);
    await loadBuilds();
  }

  async function requestNickname(name) {
    const { error } = await supabase.rpc("request_nickname", { p_requested_name: name });
    if (error) return notify(`닉네임 신청 실패: ${error.message}`, "error");
    notify("닉네임 신청을 접수했습니다.");
    await loadUserData(user.id);
  }

  async function reviewNickname(request, approveValue) {
    const note = approveValue ? null : (window.prompt("반려 사유를 입력하세요. (선택)") || null);
    const { error } = await supabase.rpc("review_nickname_request", { p_request_id: request.id, p_approve: approveValue, p_admin_note: note });
    if (error) return notify(`닉네임 처리 실패: ${error.message}`, "error");
    notify(approveValue ? "닉네임을 승인했습니다." : "닉네임 신청을 반려했습니다.");
    await loadAdminData();
    if (user) await loadUserData(user.id);
    await loadBuilds();
  }

  async function saveAnnouncement(form) {
    const { error } = await supabase.from("announcements").insert({ title: form.title.trim(), body: form.body.trim(), is_pinned: Boolean(form.is_pinned), is_published: true, created_by: user.id });
    if (error) return notify(`공지 등록 실패: ${error.message}`, "error");
    notify("공지를 등록했습니다.");
    await loadAdminData();
  }

  async function deleteAnnouncement(notice) {
    if (!window.confirm(`"${notice.title}" 공지를 삭제할까요?`)) return;
    const { error } = await supabase.from("announcements").delete().eq("id", notice.id);
    if (error) return notify(`공지 삭제 실패: ${error.message}`, "error");
    notify("공지를 삭제했습니다.");
    await loadAdminData();
  }

  async function saveFinished(build, action = "create") {
    setEditor(null);
    await loadBuilds();
    notify(action === "edit" ? "추천세팅을 수정했습니다." : "추천세팅을 게시했습니다.");
    await openBuild(build, false);
  }

  async function deleteBuild(build) {
    if (!user) return;
    const ok = window.confirm(`"${build.title}" 세팅을 삭제할까요?
삭제 후에는 되돌릴 수 없습니다.`);
    if (!ok) return;

    const { data, error } = await supabase
      .from("builds")
      .delete()
      .eq("id", build.id)
      .select("id");

    if (error) return notify(`삭제 실패: ${error.message}`, "error");
    if (!data?.length) return notify("삭제 권한이 없거나 이미 삭제된 세팅입니다.", "error");

    setSelectedBuild(null);
    setSelectedSlots([]);
    await loadBuilds();
    notify("추천세팅을 삭제했습니다.");
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
    await Promise.all([loadAdminData(), loadModbooks()]);
  }

  async function reject(report) {
    const { error } = await supabase.rpc("reject_modbook_report", { p_report_id: report.id });
    if (error) return notify(error.message, "error");
    notify("제보를 반려했습니다.");
    await loadAdminData();
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
        adminPendingCount={
          adminNicknameRequests.filter((r) => r.status === "pending").length +
          adminReports.filter((r) => r.status === "pending").length
        }
        onLogin={login}
        onLogout={logout}
        onCreate={() => setEditor({ build: null, slots: [], mode: "create" })}
        onProfile={() => setProfileModal(true)}
      />

      {tab === "builds" && (
        <>
          <NoticeStrip announcements={announcements} onOpen={() => setTab("notices")} />
          <Hero user={user} onCreate={() => setEditor({ build: null, slots: [], mode: "create" })} onJump={jumpToBuilds} onPresets={() => setTab("presets")} />
          <BuildsPage builds={builds} buildSlotsMap={buildSlotsMap} modMap={modMap} loading={loading} user={user} favorites={favorites} onOpen={openBuild} onFavorite={toggleFavorite} onCreate={() => setEditor({ build: null, slots: [], mode: "create" })} categoryFilter={categoryFilter} setCategoryFilter={setCategoryFilter} />
        </>
      )}
      {tab === "presets" && <PresetsPage user={user} builds={builds} buildSlotsMap={buildSlotsMap} modMap={modMap} favorites={favorites} onOpen={openBuild} onFavorite={toggleFavorite} onLogin={login} />}
      {tab === "modbooks" && <ModbooksPage modbooks={modbooks} />}
      {tab === "reports" && <ReportsPage user={user} myReports={myReports} onNewReport={() => setReportEditor(true)} onLogin={login} />}
      {tab === "notices" && (
        <NoticesPage
          announcements={announcements}
          profile={profile}
          pendingNicknameCount={adminNicknameRequests.filter((r) => r.status === "pending").length}
          onAnnouncementSave={saveAnnouncement}
          onAnnouncementDelete={deleteAnnouncement}
          onOpenNicknameAdmin={() => {
            setAdminMode("nicknames");
            setTab("admin");
          }}
        />
      )}
      {tab === "admin" && (
        <AdminPage
          profile={profile}
          reports={adminReports}
          nicknameRequests={adminNicknameRequests}
          announcements={announcements}
          initialMode={adminMode}
          onApprove={approve}
          onReject={reject}
          onNicknameReview={reviewNickname}
          onAnnouncementSave={saveAnnouncement}
          onAnnouncementDelete={deleteAnnouncement}
        />
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
          profile={profile}
          userVote={userVotes.get(selectedBuild.id) || 0}
          comments={selectedComments}
          onFavorite={toggleFavorite}
          onVote={(value) => voteBuild(selectedBuild, value)}
          onComment={addComment}
          onDeleteComment={deleteComment}
          onLogin={login}
          onClose={() => setSelectedBuild(null)}
          onEdit={(build, slots) => {
            setEditor({ build, slots, mode: "edit" });
            setSelectedBuild(null);
          }}
          onDelete={deleteBuild}
          onClone={() => {
            setEditor({ build: selectedBuild, slots: selectedSlots, mode: "clone" });
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
          mode={editor.mode || "create"}
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

      {profileModal && user && <ProfileModal user={user} profile={profile} request={nicknameRequest} onClose={() => setProfileModal(false)} onRequest={requestNickname} />}

      {recruitModal && <RecruitPosterModal onClose={() => setRecruitModal(false)} />}
      <FloatingContextPanel
        tab={tab}
        announcements={announcements}
        user={user}
        onHome={() => {
          setTab("builds");
          window.setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 30);
        }}
        onNotice={() => setTab("notices")}
        onReport={() => setTab("reports")}
        onPreset={() => user ? setTab("presets") : login()}
        onRecruit={() => setRecruitModal(true)}
      />

      <Toast message={toast.message} tone={toast.tone} />

      {user && (
        <button className="fab mobile-only" onClick={() => setEditor({ build: null, slots: [], mode: "create" })}>
          +
        </button>
      )}
    </div>
  );
}
