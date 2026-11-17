import { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import type { GameCard, Mode } from "../../shared/game";
import { audio } from "../lib/audio";

gsap.registerPlugin(useGSAP);

export const THEMES = {
  lady: {
    name: "小姐牌",
    english: "The Lady",
    tag: "经典微醺局",
    detail: "熟悉的规则，意想不到的故事。",
    suit: "♥",
    color: "#b56873",
    music: "玫瑰夜曲",
  },
  queen: {
    name: "大姐牌",
    english: "The Queen",
    tag: "气场全开局",
    detail: "今晚的节奏，由大姐来掌握。",
    suit: "♠",
    color: "#7b6f9c",
    music: "紫夜摇摆",
  },
  gentleman: {
    name: "少爷牌",
    english: "The Gentleman",
    tag: "优雅整活局",
    detail: "举止可以优雅，快乐不必拘谨。",
    suit: "♣",
    color: "#53877b",
    music: "午夜漫步",
  },
};

export function Emblem({ mode = "lady" }: { mode?: Mode }) {
  return (
    <svg viewBox="0 0 200 260" className="emblem" aria-hidden="true">
      <ellipse
        cx="100"
        cy="136"
        rx="72"
        ry="105"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
      />
      <ellipse
        cx="100"
        cy="136"
        rx="65"
        ry="98"
        fill="none"
        stroke="currentColor"
        strokeWidth=".45"
      />
      <path
        d="M26 137h148M100 27v220M45 58l110 156M155 58 45 214"
        opacity=".23"
        stroke="currentColor"
        strokeWidth=".8"
      />
      <path d="m71 70-9-28 25 14 13-25 13 25 25-14-9 28Z" fill="currentColor" />
      <path d="M68 76h64v8H68Z" fill="currentColor" />
      <path d="M70 115c-12-43 68-50 62 1l-10 30-43-3Z" fill="currentColor" />
      <path
        d="M83 95c18 7 16 18 39 19v19c0 22-12 32-23 32-15 0-22-17-22-33v-24Z"
        fill="var(--paper)"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="m85 126 9-1m12 0 9 1m-15 2-3 13h5m-9 9q7 5 13-1"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      {mode === "gentleman" ? (
        <>
          <path
            d="m79 167 21 14 21-14 22 15 12 54H45l12-54Z"
            fill="currentColor"
          />
          <path d="m86 164 14 16 14-16-4 48H90Z" fill="var(--paper)" />
          <path d="m90 182 10 5 10-5v12l-10-5-10 5Z" fill="currentColor" />
        </>
      ) : (
        <>
          <path
            d="M86 159v17l-29 12-12 48h110l-12-48-29-12v-17"
            fill="var(--paper)"
            stroke="currentColor"
            strokeWidth="2"
          />
          <path d="m57 188 43 19 43-19 12 48H45Z" fill="currentColor" />
          <path
            d="m65 181 35 14 35-14"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
          />
          <path d="m100 188-5-7 5-7 5 7Z" fill="currentColor" />
        </>
      )}
      <path
        d="m36 124 4-8 4 8-4 8Zm120 0 4-8 4 8-4 8ZM96 245l4-7 4 7-4 7Z"
        fill="currentColor"
      />
      <path
        d="M38 171q-17 13 0 30m124-30q17 13 0 30"
        fill="none"
        stroke="currentColor"
      />
    </svg>
  );
}

export function CardBack({ mode }: { mode: Mode }) {
  return (
    <div className={`card-back theme-${mode}`}>
      <div className="back-border">
        <div className="back-diamond">
          <span>{THEMES[mode].suit}</span>
        </div>
        <span className="back-name">今夜开牌</span>
        <span className="back-star top">✧</span>
        <span className="back-star bottom">✧</span>
      </div>
    </div>
  );
}

export function Face({
  mode,
  rank = "Q",
  suit,
  title,
  description,
}: {
  mode: Mode;
  rank?: string;
  suit?: string;
  title?: string;
  description?: string;
}) {
  const symbol = suit || THEMES[mode].suit;
  return (
    <div className={`card-face theme-${mode}`}>
      <div className="card-corner">
        <b>{rank}</b>
        <span>{symbol}</span>
      </div>
      <div className="card-inner">
        <span className="card-edition">{THEMES[mode].english}</span>
        {description ? (
          <>
            <div className="draw-symbol">{symbol}</div>
            <h2>{title}</h2>
            <p>{description}</p>
            <span className="rule-flourish">✦</span>
          </>
        ) : (
          <>
            <Emblem mode={mode} />
            <strong className="face-title">{THEMES[mode].name}</strong>
            <span className="face-subtitle">{THEMES[mode].tag}</span>
          </>
        )}
      </div>
      <div className="card-corner bottom-corner">
        <b>{rank}</b>
        <span>{symbol}</span>
      </div>
    </div>
  );
}

export function CardFan({ mode, onTry }: { mode: Mode; onTry: () => void }) {
  const scope = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(
        {
          reduce: "(prefers-reduced-motion: reduce)",
          mobile: "(max-width: 700px)",
          desktop: "(min-width: 701px)",
        },
        (context) => {
          const reduce = context.conditions?.reduce;
          gsap.from(".fan-card", {
            y: reduce ? 0 : 70,
            rotation: 0,
            autoAlpha: 0,
            duration: reduce ? 0 : 0.9,
            stagger: 0.12,
            ease: "power3.out",
          });
        },
      );
      return () => mm.revert();
    },
    { scope, dependencies: [mode], revertOnUpdate: true },
  );
  const { contextSafe } = useGSAP({ scope });
  const shuffle = contextSafe(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    audio.play("shuffle");
    gsap
      .timeline({ defaults: { ease: "power2.inOut", duration: 0.22 } })
      .to(".fan-card", { y: -15, stagger: 0.06 })
      .to(".fan-card", { y: 0, stagger: 0.06 });
  });
  return (
    <div className={`fan-scene theme-${mode}`} ref={scope}>
      <div className="orbit orbit-one" />
      <div className="orbit orbit-two" />
      <span className="spark spark-one">✦</span>
      <span className="spark spark-two">✧</span>
      <button
        className="fan-cards"
        onClick={onTry}
        onPointerEnter={shuffle}
        aria-label="同屏开一局，体验卡牌动画"
      >
        <div className="fan-card fan-left">
          <Face mode="gentleman" rank="K" suit="♣" />
        </div>
        <div className="fan-card fan-right">
          <CardBack mode={mode} />
        </div>
        <div className="fan-card fan-center">
          <Face mode={mode} />
        </div>
      </button>
      <span className="fan-caption">一张牌，让故事发生</span>
    </div>
  );
}

export function DrawCard({
  mode,
  card,
  onBusy,
}: {
  mode: Mode;
  card: GameCard | null;
  onBusy: (busy: boolean) => void;
}) {
  const scope = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      if (!card) {
        onBusy(false);
        return;
      }
      const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
      onBusy(true);
      audio.play("draw");
      const tl = gsap.timeline({ onComplete: () => onBusy(false) });
      tl.fromTo(
        ".draw-moving",
        {
          y: reduce ? 0 : 55,
          scale: reduce ? 1 : 0.88,
          rotation: reduce ? 0 : -5,
        },
        {
          y: 0,
          scale: 1,
          rotation: 0,
          duration: reduce ? 0 : 0.5,
          ease: "power3.out",
        },
      ).fromTo(
        ".draw-flipper",
        { rotationY: 180 },
        {
          rotationY: 0,
          duration: reduce ? 0 : 0.65,
          ease: "power2.inOut",
          onStart: () => audio.play("flip"),
        },
        reduce ? 0 : 0.2,
      );
    },
    { scope, dependencies: [card?.id], revertOnUpdate: true },
  );
  return (
    <div className="draw-stage" ref={scope} aria-live="polite">
      <div className="deck-under deck-under-two">
        <CardBack mode={mode} />
      </div>
      <div className="deck-under">
        <CardBack mode={mode} />
      </div>
      <div className="draw-moving">
        <div className="draw-flipper">
          {card ? (
            <>
              <div className="flip-front">
                <Face
                  mode={mode}
                  rank={card.rank}
                  suit={card.suit}
                  title={card.title}
                  description={card.description}
                />
              </div>
              <div className="flip-back">
                <CardBack mode={mode} />
              </div>
            </>
          ) : (
            <CardBack mode={mode} />
          )}
        </div>
      </div>
    </div>
  );
}
