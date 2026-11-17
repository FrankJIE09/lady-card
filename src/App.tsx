import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  ArrowRight,
  Check,
  ChevronLeft,
  Copy,
  Crown,
  DoorOpen,
  HelpCircle,
  Link,
  LoaderCircle,
  Music2,
  Plus,
  QrCode,
  RotateCcw,
  Settings2,
  Shuffle,
  Smartphone,
  Users,
  Volume2,
  VolumeX,
  Wifi,
  X,
} from "lucide-react";
import QRCode from "qrcode";
import {
  DEFAULT_RULES,
  createDeck,
  type Mode,
  type Rule,
  type RoomView,
  type GameCard,
} from "../shared/game";
import { CardFan, DrawCard, THEMES } from "./components/Cards";
import { audio } from "./lib/audio";
import {
  request,
  RequestError,
  type RoomSession,
  type SessionResponse,
} from "./lib/api";
import { forget, readSaved, save } from "./lib/storage";

type LocalGame = { room: RoomView; deck: GameCard[] };
type ModalName = "rules" | "join" | "local" | "invite" | "leave" | null;
const modeKeys: Mode[] = ["lady", "queen", "gentleman"];
const id = () =>
  globalThis.crypto?.randomUUID?.() ||
  `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;

function Dialog({
  title,
  children,
  onClose,
  wide = false,
  message,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
  message?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    el?.showModal();
    return () => el?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`dialog ${wide ? "dialog-wide" : ""}`}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      aria-label={title}
    >
      <div className="dialog-head">
        <h2>{title}</h2>
        <button className="icon-button" onClick={onClose} aria-label="关闭">
          <X size={20} />
        </button>
      </div>
      {message && (
        <p className="dialog-message" role="status">
          {message}
        </p>
      )}
      {children}
    </dialog>
  );
}

export default function App() {
  const [mode, setMode] = useState<Mode>("lady");
  const [rules, setRules] = useState<Record<Mode, Rule[]>>(() =>
    readSaved("tonight-rules-v1", DEFAULT_RULES),
  );
  const [draftRules, setDraftRules] = useState<Rule[]>([]);
  const [session, setSession] = useState<RoomSession | null>(() => {
    const saved = readSaved<RoomSession | null>("tonight-session", null);
    const invited = new URLSearchParams(location.search).get("room");
    return invited && saved?.code !== invited ? null : saved;
  });
  const [local, setLocal] = useState<LocalGame | null>(null);
  const [room, setRoom] = useState<RoomView | null>(null);
  const [modal, setModal] = useState<ModalName>(null);
  const [name, setName] = useState<string>(() => readSaved("tonight-name", ""));
  const [joinCode, setJoinCode] = useState(
    () => new URLSearchParams(location.search).get("room") || "",
  );
  const [localNames, setLocalNames] = useState("我, 好朋友");
  const [busy, setBusy] = useState(false);
  const [animating, setAnimating] = useState(false);
  const [connected, setConnected] = useState(true);
  const [message, setMessage] = useState("");
  const [music, setMusic] = useState(false);
  const [volume, setVolume] = useState<number>(() =>
    readSaved("tonight-volume", 0.35),
  );
  const [qr, setQr] = useState("");
  const [shareUrl, setShareUrl] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [copied, setCopied] = useState(false);
  const busyRef = useRef(false);
  const theme = THEMES[room?.mode || mode];
  const host = !!local || room?.hostId === session?.playerId;
  const turn = room?.players.find((p) => p.id === room.turnPlayerId);
  const myTurn = host || turn?.id === session?.playerId;
  const updateRoom = useCallback((next: RoomView) => {
    setRoom((previous) =>
      !previous ||
      previous.code !== next.code ||
      next.revision >= previous.revision
        ? next
        : previous,
    );
    setMode(next.mode);
  }, []);
  const onCardBusy = useCallback((value: boolean) => setAnimating(value), []);

  useEffect(() => {
    if (joinCode && !session) setModal("join");
  }, []);
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(""), 5000);
    return () => clearTimeout(t);
  }, [message]);
  useEffect(() => {
    audio.setMode(room?.mode || mode);
  }, [mode, room?.mode]);
  useEffect(() => {
    audio.setVolume(volume);
    save("tonight-volume", volume);
  }, [volume]);
  useEffect(
    () => () => {
      audio.disable();
    },
    [],
  );
  useEffect(() => {
    if (!session || local) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const data = await request<{ room: RoomView }>(
          `/rooms/${session.code}`,
          undefined,
          session.token,
        );
        if (!cancelled) {
          updateRoom(data.room);
          setConnected(true);
        }
      } catch (e) {
        if (!cancelled) {
          setConnected(false);
          if (e instanceof RequestError && [401, 404, 410].includes(e.status)) {
            forget("tonight-session");
            setSession(null);
            setRoom(null);
            setMessage(e.message);
            setJoinCode(session.code);
            if (e.status === 401) setModal("join");
            return;
          }
          if (!room) setMessage((e as Error).message);
        }
      }
      if (!cancelled) timer = setTimeout(poll, document.hidden ? 5000 : 1200);
    };
    void poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [session, local, updateRoom]);

  useEffect(() => {
    if (!room || local || modal !== "invite") return;
    let alive = true;
    const make = async () => {
      let url = new URL(location.href);
      url.search = "";
      url.searchParams.set("room", room.code);
      if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
        try {
          const data = await request<{
            urls?: string[];
            address?: string;
            addresses?: string[];
            lanUrls?: string[];
          }>("/network");
          const address =
            data.urls?.[0] ||
            data.lanUrls?.[0] ||
            data.addresses?.[0] ||
            data.address;
          if (address) {
            const lan = new URL(
              address.includes("://") ? address : `http://${address}`,
            );
            url.hostname = lan.hostname;
          }
        } catch {
          /* Current URL stays usable on this device. */
        }
      }
      const value = url.toString();
      const image = await QRCode.toDataURL(value, {
        width: 256,
        margin: 2,
        color: { dark: "#39293f", light: "#fffaf0" },
      });
      if (alive) {
        setShareUrl(value);
        setQr(image);
      }
    };
    void make();
    return () => {
      alive = false;
    };
  }, [modal, room?.code, local]);

  async function perform(task: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await task();
    } catch (e) {
      setMessage((e as Error).message || "操作未完成，请重试。");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  function keepSession(data: SessionResponse) {
    const next = {
      code: data.room.code,
      token: data.token,
      playerId: data.playerId,
    };
    save("tonight-session", next);
    save("tonight-name", name.trim());
    setSession(next);
    setLocal(null);
    updateRoom(data.room);
    setModal(null);
    setConnected(true);
    const url = new URL(location.href);
    url.searchParams.set("room", data.room.code);
    history.replaceState(null, "", url);
  }
  function createRoom(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setMessage("先起一个大家认得的昵称吧。");
      return;
    }
    void perform(async () => {
      keepSession(
        await request<SessionResponse>("/rooms", {
          name: name.trim(),
          mode,
          rules: rules[mode],
        }),
      );
      audio.play("click");
    });
  }
  function joinRoom(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !joinCode.trim()) {
      setMessage("填好昵称和房间号，就能入座。");
      return;
    }
    void perform(async () => {
      keepSession(
        await request<SessionResponse>(
          `/rooms/${joinCode.trim().toUpperCase()}/join`,
          { name: name.trim() },
        ),
      );
      audio.play("click");
    });
  }
  function startLocal(e?: FormEvent) {
    e?.preventDefault();
    const names = localNames
      .split(/[,，、\n]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 12);
    if (!names.length) {
      setMessage("至少填写一个玩家昵称。");
      return;
    }
    const players = names.map((name) => ({
      id: id(),
      name: name.slice(0, 16),
    }));
    const deck = createDeck(mode, rules[mode]);
    const view: RoomView = {
      code: "LOCAL",
      mode,
      phase: "playing",
      players,
      hostId: players[0].id,
      turnPlayerId: players[0].id,
      currentCard: null,
      remaining: deck.length,
      history: [],
      rules: rules[mode],
      revision: 0,
    };
    forget("tonight-session");
    setSession(null);
    setLocal({ room: view, deck });
    setRoom(view);
    setModal(null);
    setShowHistory(false);
    audio.play("shuffle");
  }
  function action(kind: "start" | "draw" | "restart") {
    if (!room || animating) return;
    if (local) {
      if (kind === "restart") {
        setModal("local");
        return;
      }
      const [card, ...deck] = local.deck;
      if (!card) return;
      const drawn = { ...card, playerId: turn?.id, playerName: turn?.name };
      const index = room.players.findIndex((p) => p.id === room.turnPlayerId);
      const next: RoomView = {
        ...room,
        currentCard: drawn,
        history: [drawn, ...room.history],
        remaining: deck.length,
        phase: deck.length ? "playing" : "finished",
        turnPlayerId: deck.length
          ? room.players[(index + 1) % room.players.length].id
          : null,
        revision: room.revision + 1,
      };
      setRoom(next);
      setLocal({ room: next, deck });
      return;
    }
    if (!session) return;
    void perform(async () => {
      const data = await request<{ room: RoomView }>(
        `/rooms/${room.code}/action`,
        { action: kind, revision: room.revision },
        session.token,
      );
      updateRoom(data.room);
      if (kind === "start" || kind === "restart") audio.play("shuffle");
    });
  }
  function leave() {
    void perform(async () => {
      if (session && room) {
        try {
          await request(
            `/rooms/${room.code}/action`,
            { action: "leave" },
            session.token,
          );
        } catch {
          setMessage("已退出此设备。网络恢复前，房间中的席位可能暂时保留。");
        }
      }
      forget("tonight-session");
      setSession(null);
      setLocal(null);
      setRoom(null);
      setModal(null);
      setShowHistory(false);
      const url = new URL(location.href);
      url.search = "";
      history.replaceState(null, "", url);
    });
  }
  function openRules() {
    setDraftRules((room?.rules || rules[mode]).map((r) => ({ ...r })));
    setModal("rules");
  }
  async function saveRules() {
    if (draftRules.some((r) => !r.title.trim() || !r.description.trim())) {
      setMessage("每张牌都需要一个名称和玩法。");
      return;
    }
    await perform(async () => {
      if (room && !local && session && room.phase === "lobby" && host) {
        const data = await request<{ room: RoomView }>(
          `/rooms/${room.code}/action`,
          {
            action: "settings",
            mode,
            rules: draftRules,
            revision: room.revision,
          },
          session.token,
        );
        updateRoom(data.room);
      }
      const next = { ...rules, [mode]: draftRules };
      setRules(next);
      save("tonight-rules-v1", next);
      setModal(null);
      setMessage("玩法已保存，下次开局就用这套。");
    });
  }
  async function toggleMusic() {
    if (music) {
      audio.disable();
      setMusic(false);
      return;
    }
    try {
      await audio.enable();
      setMusic(true);
    } catch {
      setMessage("浏览器暂时无法播放声音，请再次点按音乐按钮。");
    }
  }
  async function copy(value: string) {
    try {
      if (navigator.clipboard?.writeText)
        await navigator.clipboard.writeText(value);
      else {
        const field = document.createElement("textarea");
        field.value = value;
        field.style.cssText = "position:fixed;opacity:0";
        const parent = document.querySelector("dialog[open]") || document.body;
        parent.append(field);
        field.focus();
        field.select();
        const ok = document.execCommand("copy");
        field.remove();
        if (!ok) throw new Error("copy");
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setMessage(`邀请链接：${value}`);
    }
  }

  return (
    <div className={`app theme-${room?.mode || mode}`}>
      <header className="site-header">
        <button
          className="brand"
          onClick={() =>
            room
              ? setModal("leave")
              : window.scrollTo({ top: 0, behavior: "smooth" })
          }
          aria-label="今夜开牌首页"
        >
          <span className="brand-mark">
            ♠<i>♥</i>
          </span>
          <span>
            今夜开牌<small>让快乐，顺其自然。</small>
          </span>
        </button>
        <nav className="header-actions">
          <button className="quiet-button rules-link" onClick={openRules}>
            <HelpCircle size={17} />
            玩法说明
          </button>
          <div className="music-widget">
            <button
              className={`music-button ${music ? "playing" : ""}`}
              onClick={toggleMusic}
              aria-label={music ? "关闭音乐" : "开启音乐"}
              aria-pressed={music}
            >
              <span className="equalizer">
                <i />
                <i />
                <i />
                <i />
              </span>
              <span>{music ? theme.music : "开启音乐"}</span>
              {music ? <Volume2 size={15} /> : <VolumeX size={15} />}
            </button>
            {music && (
              <label className="volume-control">
                <span className="sr-only">音乐音量</span>
                <input
                  aria-label="音乐音量"
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={volume}
                  onChange={(e) => setVolume(Number(e.target.value))}
                />
              </label>
            )}
          </div>
        </nav>
      </header>

      {!room ? (
        <main className="home-main">
          <section className="hero">
            <div className="hero-copy">
              <div className="invitation">
                <span />
                今晚，给快乐留个位置
              </div>
              <h1>
                好朋友，
                <br />
                好戏<span className="gold-text">开场。</span>
                <svg
                  className="title-star"
                  viewBox="0 0 40 40"
                  aria-hidden="true"
                >
                  <path
                    d="M20 0q0 20 20 20-20 0-20 20Q20 20 0 20 20 20 20 0"
                    fill="currentColor"
                  />
                </svg>
              </h1>
              <p className="hero-description">
                把手机放上桌，把拘谨放一边。
                <br />
                选一副牌，和朋友一起开启今晚的故事。
              </p>
              <div
                className="theme-selector"
                role="group"
                aria-label="选择玩法"
              >
                {modeKeys.map((key) => (
                  <button
                    key={key}
                    className={`theme-option ${mode === key ? "selected" : ""}`}
                    aria-pressed={mode === key}
                    onClick={() => {
                      setMode(key);
                      audio.play("click");
                    }}
                  >
                    <span className={`theme-suit suit-${key}`}>
                      {THEMES[key].suit}
                    </span>
                    <span>
                      <strong>{THEMES[key].name}</strong>
                      <small>{THEMES[key].tag}</small>
                    </span>
                    {mode === key && <Check size={15} />}
                  </button>
                ))}
              </div>
              <button className="text-button theme-rules" onClick={openRules}>
                看看这副牌怎么玩 <ArrowRight size={15} />
              </button>
            </div>
            <CardFan mode={mode} onTry={() => setModal("local")} />
          </section>
          <section className="entry-section">
            <div className="entry-intro">
              <span className="section-ornament">✦</span>
              <div>
                <h2>人齐了，就开一局。</h2>
                <p>一人建房，好友扫码入座。</p>
              </div>
            </div>
            <form className="room-form" onSubmit={createRoom}>
              <label className="nickname-label">
                <Users size={18} />
                <input
                  aria-label="你的昵称"
                  placeholder="起个今晚的昵称"
                  maxLength={16}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <button className="primary-button" disabled={busy} type="submit">
                {busy ? (
                  <LoaderCircle className="spinning" size={18} />
                ) : (
                  <Plus size={18} />
                )}
                创建房间
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={() => setModal("join")}
              >
                加入房间
                <ArrowRight size={17} />
              </button>
            </form>
            <div className="entry-foot">
              <span>
                <Wifi size={14} />
                在线联机 · 局域网都能玩
              </span>
              <button className="text-button" onClick={() => setModal("local")}>
                <Smartphone size={15} />
                朋友就在身边？同屏开一局
                <ArrowRight size={14} />
              </button>
            </div>
          </section>
          {session && (
            <div className="reconnect-note">
              <LoaderCircle size={16} className="spinning" />
              正在恢复房间 {session.code}…
              <button
                className="text-button"
                onClick={() => {
                  forget("tonight-session");
                  setSession(null);
                }}
              >
                返回首页
              </button>
            </div>
          )}
          <section className="little-promises">
            <div>
              <span>♧</span>
              <p>
                <strong>三副牌，三种气氛</strong>
                <small>经典、气场、整活，随你选择</small>
              </p>
            </div>
            <div>
              <Shuffle size={24} />
              <p>
                <strong>每一张，都有新故事</strong>
                <small>随机抽牌，规则也可以自己定</small>
              </p>
            </div>
            <div>
              <Music2 size={24} />
              <p>
                <strong>音乐到位，快乐加倍</strong>
                <small>专属氛围音乐，陪你慢慢玩</small>
              </p>
            </div>
          </section>
        </main>
      ) : (
        <main className="game-main">
          <div className="game-topline">
            <button className="quiet-button" onClick={() => setModal("leave")}>
              <ChevronLeft size={17} />
              离开牌桌
            </button>
            <span className="connection">
              <i className={connected || local ? "" : "offline"} />
              {local ? "同屏模式" : connected ? "房间已连接" : "连接中…"}
            </span>
          </div>
          <div className="game-heading">
            <div>
              <p className="game-eyebrow">{theme.tag}</p>
              <h1>
                {theme.name}
                <span>
                  {room.phase === "lobby"
                    ? "入座，等好戏。"
                    : room.phase === "finished"
                      ? "好戏，未完待续。"
                      : "下一张，会是谁？"}
                </span>
              </h1>
            </div>
            {!local && (
              <button className="room-code" onClick={() => setModal("invite")}>
                <span>房间号</span>
                <strong>{room.code}</strong>
                <QrCode size={20} />
              </button>
            )}
          </div>
          <div className="table-layout">
            <section className="play-surface">
              <div className="table-corner top-left">✧</div>
              <div className="table-corner bottom-right">✧</div>
              {room.phase === "lobby" ? (
                <div className="lobby">
                  <div className="lobby-emblem">
                    <Crown size={28} />
                  </div>
                  <h2>好朋友，等你入座</h2>
                  <p>
                    把房间号发给朋友，
                    <br />
                    或让大家扫描二维码加入。
                  </p>
                  <div className="lobby-code">{room.code}</div>
                  <button
                    className="secondary-button"
                    onClick={() => setModal("invite")}
                  >
                    <QrCode size={17} />
                    邀请朋友
                  </button>
                  <span className="lobby-note">
                    {room.players.length} 位已入座 · 最多 12 人
                  </span>
                </div>
              ) : (
                <>
                  <div className="turn-label">
                    {room.currentCard ? (
                      <>
                        <span>{room.currentCard.playerName}</span> 抽到了
                      </>
                    ) : (
                      "今晚的第一张牌，等你揭晓"
                    )}
                  </div>
                  <DrawCard
                    mode={room.mode}
                    card={room.currentCard}
                    onBusy={onCardBusy}
                  />
                  <div className="deck-progress">
                    <div>
                      <span
                        style={{
                          width: `${((52 - room.remaining) / 52) * 100}%`,
                        }}
                      />
                    </div>
                    <span>已揭晓 {52 - room.remaining} / 52 张</span>
                  </div>
                </>
              )}
            </section>
            <aside className="table-sidebar">
              <section className="players-panel">
                <div className="panel-title">
                  <h2>这桌的朋友</h2>
                  <span>{room.players.length} 人</span>
                </div>
                <div className="player-list">
                  {room.players.map((player, i) => (
                    <div
                      className={`player ${player.id === room.turnPlayerId ? "current" : ""}`}
                      key={player.id}
                    >
                      <span className={`avatar avatar-${i % 4}`}>
                        {player.name.slice(0, 1)}
                      </span>
                      <div>
                        <strong>
                          {player.name}
                          {player.id === session?.playerId && (
                            <small>（你）</small>
                          )}
                        </strong>
                        <span>
                          {player.id === room.turnPlayerId
                            ? "轮到抽牌"
                            : player.id === room.hostId
                              ? "本局房主"
                              : "快乐已就位"}
                        </span>
                      </div>
                      {player.id === room.hostId ? (
                        <Crown size={15} />
                      ) : player.id === room.turnPlayerId ? (
                        <span className="turn-dot" />
                      ) : null}
                    </div>
                  ))}
                </div>
              </section>
              <section className="draw-controls">
                {room.phase === "lobby" ? (
                  <>
                    <h3>{host ? "准备好了吗？" : "朋友已就位"}</h3>
                    <p>
                      {host
                        ? "确认大家到齐，洗牌开场。"
                        : "等房主开始，一起揭晓第一张。"}
                    </p>
                    <button
                      className="primary-button"
                      disabled={!host || busy}
                      onClick={() => action("start")}
                    >
                      <Shuffle size={18} />
                      {host ? "人齐了，开始游戏" : "等待房主开始"}
                    </button>
                  </>
                ) : room.phase === "finished" ? (
                  <>
                    <h3>这副牌，满是回忆。</h3>
                    <p>52 张牌已全部揭晓。再来一局？</p>
                    <button
                      className="primary-button"
                      disabled={!host || busy}
                      onClick={() => action("restart")}
                    >
                      <RotateCcw size={18} />
                      {host ? "再开一局" : "等待房主再开一局"}
                    </button>
                  </>
                ) : (
                  <>
                    <span className="next-label">下一位</span>
                    <h3>{turn?.name || "朋友"}</h3>
                    <p>
                      {myTurn
                        ? "深呼吸，好运就在下一张。"
                        : "放轻松，很快就轮到你。"}
                    </p>
                    <button
                      className="primary-button draw-button"
                      disabled={
                        !myTurn || busy || animating || (!local && !connected)
                      }
                      onClick={() => action("draw")}
                    >
                      {busy || animating ? (
                        <LoaderCircle size={18} className="spinning" />
                      ) : (
                        <Shuffle size={18} />
                      )}{" "}
                      {animating
                        ? "好戏正在揭晓…"
                        : !myTurn
                          ? `等待 ${turn?.name} 抽牌`
                          : "抽一张牌"}
                      <ArrowRight size={19} />
                    </button>
                    {host && !local && turn?.id !== session?.playerId && (
                      <small className="control-note">
                        房主可以代当前玩家抽牌
                      </small>
                    )}
                  </>
                )}
                <button
                  className="text-button rules-action"
                  onClick={openRules}
                >
                  <Settings2 size={15} />
                  {room.phase === "lobby" && host
                    ? "调整本局玩法"
                    : "查看本局规则"}
                </button>
              </section>
              {room.history.length > 0 && (
                <section className="history-panel">
                  <button
                    className="panel-title"
                    onClick={() => setShowHistory(!showHistory)}
                    aria-expanded={showHistory}
                  >
                    <h2>今晚的故事</h2>
                    <span>
                      {showHistory ? "收起" : `查看 ${room.history.length} 张`}
                    </span>
                  </button>
                  {showHistory && (
                    <ol>
                      {room.history.map((card) => (
                        <li key={card.id}>
                          <b>
                            {card.rank}
                            <span>{card.suit}</span>
                          </b>
                          <span>
                            {card.title}
                            <small>{card.playerName}</small>
                          </span>
                        </li>
                      ))}
                    </ol>
                  )}
                </section>
              )}
            </aside>
          </div>
        </main>
      )}
      <footer className="site-footer">
        <span>
          ♠ <span>今夜开牌</span> · 快乐没有标准答案
        </span>
        <span>喝水也尽兴，开心就好。</span>
      </footer>

      {modal === "join" && (
        <Dialog
          message={message}
          title="朋友，欢迎入座"
          onClose={() => setModal(null)}
        >
          <p className="dialog-description">
            输入朋友分享的房间号，随时入座。游戏中加入会排在玩家列表末尾，按顺序轮流抽牌。
          </p>
          <form className="stack-form" onSubmit={joinRoom}>
            <label>
              你的昵称
              <input
                autoFocus
                maxLength={16}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="大家怎么称呼你"
                required
              />
            </label>
            <label>
              房间号
              <input
                className="code-input"
                value={joinCode}
                maxLength={8}
                onChange={(e) =>
                  setJoinCode(
                    e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""),
                  )
                }
                placeholder="6 位房间号"
                autoComplete="off"
                required
              />
            </label>
            <button className="primary-button" disabled={busy}>
              {busy ? (
                <LoaderCircle className="spinning" size={18} />
              ) : (
                <DoorOpen size={18} />
              )}
              加入这桌
            </button>
          </form>
        </Dialog>
      )}
      {modal === "local" && (
        <Dialog
          message={message}
          title="同屏开一局"
          onClose={() => setModal(null)}
        >
          <p className="dialog-description">
            共用一部手机，轮流抽牌。无需联网，聚会随时开场。
          </p>
          <form className="stack-form" onSubmit={startLocal}>
            <label>
              今晚的朋友
              <textarea
                autoFocus
                value={localNames}
                maxLength={210}
                onChange={(e) => setLocalNames(e.target.value)}
                placeholder="小王, 小李, 小张"
                rows={3}
              />
              <small>用逗号分隔昵称，1–12 人均可。</small>
            </label>
            <div className="selected-mode">
              <span>{THEMES[mode].suit}</span>
              {THEMES[mode].name}
              <small>{THEMES[mode].tag}</small>
            </div>
            <button className="primary-button">
              <Shuffle size={18} />
              洗牌，开始今晚的故事
            </button>
          </form>
        </Dialog>
      )}
      {modal === "rules" && (
        <Dialog
          message={message}
          title={`${theme.name} · 今晚怎么玩`}
          wide
          onClose={() => setModal(null)}
        >
          <p className="dialog-description">
            一副 52
            张牌，按顺序轮流抽取。以下是可调整的聚会版本，和朋友约定好就开始。
          </p>
          <div className="rules-list">
            {draftRules.map((rule, index) => (
              <div className="rule-row" key={rule.rank}>
                <span className="rule-rank">{rule.rank}</span>
                {!room || (room.phase === "lobby" && host) ? (
                  <div>
                    <input
                      aria-label={`${rule.rank} 牌名称`}
                      value={rule.title}
                      maxLength={24}
                      onChange={(e) =>
                        setDraftRules(
                          draftRules.map((r, i) =>
                            i === index ? { ...r, title: e.target.value } : r,
                          ),
                        )
                      }
                    />
                    <textarea
                      aria-label={`${rule.rank} 牌玩法`}
                      value={rule.description}
                      maxLength={160}
                      rows={2}
                      onChange={(e) =>
                        setDraftRules(
                          draftRules.map((r, i) =>
                            i === index
                              ? { ...r, description: e.target.value }
                              : r,
                          ),
                        )
                      }
                    />
                  </div>
                ) : (
                  <div>
                    <strong>{rule.title}</strong>
                    <p>{rule.description}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
          {(!room || (room.phase === "lobby" && host)) && (
            <div className="dialog-bottom">
              <button
                className="text-button"
                onClick={() =>
                  setDraftRules(DEFAULT_RULES[mode].map((r) => ({ ...r })))
                }
              >
                恢复默认
              </button>
              <button
                className="primary-button"
                disabled={busy}
                onClick={saveRules}
              >
                <Check size={17} />
                保存玩法
              </button>
            </div>
          )}
        </Dialog>
      )}
      {modal === "invite" && room && (
        <Dialog
          message={message}
          title="给朋友留好了位置"
          onClose={() => setModal(null)}
        >
          <div className="invite-content">
            <p>扫码入座，一起开启今晚的故事。</p>
            {qr ? (
              <img
                src={qr}
                width="220"
                height="220"
                alt={`加入房间 ${room.code} 的二维码`}
              />
            ) : (
              <LoaderCircle className="spinning" />
            )}
            <div className="invite-code">{room.code}</div>
            <button
              className="primary-button"
              onClick={() => copy(shareUrl)}
              disabled={!shareUrl}
            >
              {copied ? <Check size={17} /> : <Copy size={17} />}{" "}
              {copied ? "链接已复制" : "复制邀请链接"}
            </button>
            <a className="invite-url" href={shareUrl}>
              <Link size={13} />
              {shareUrl}
            </a>
            <small>局域网游玩时，朋友需要连接同一个 Wi-Fi。</small>
          </div>
        </Dialog>
      )}
      {modal === "leave" && (
        <Dialog
          message={message}
          title="先离开这桌？"
          onClose={() => setModal(null)}
        >
          <p className="dialog-description">
            {local
              ? "离开后，这一局的进度会结束。"
              : "其他朋友可以继续玩。房主离开时，位置将交给下一位朋友。"}
          </p>
          <div className="dialog-bottom">
            <button className="secondary-button" onClick={() => setModal(null)}>
              继续玩
            </button>
            <button className="primary-button" onClick={leave} disabled={busy}>
              离开牌桌
            </button>
          </div>
        </Dialog>
      )}
      {message && !modal && (
        <div className="toast" role="status">
          <span>{message}</span>
          <button
            className="icon-button"
            aria-label="关闭提示"
            onClick={() => setMessage("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
