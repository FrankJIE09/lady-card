export type Mode = "lady" | "queen" | "gentleman";
export type Phase = "lobby" | "playing" | "finished";
export interface Rule {
  rank: string;
  title: string;
  description: string;
}
export interface GameCard extends Rule {
  id: string;
  suit: string;
  playerId?: string;
  playerName?: string;
}
export interface Player {
  id: string;
  name: string;
}
export interface RoomView {
  code: string;
  mode: Mode;
  phase: Phase;
  players: Player[];
  hostId: string;
  turnPlayerId: string | null;
  currentCard: GameCard | null;
  remaining: number;
  history: GameCard[];
  rules: Rule[];
  revision: number;
}
export const RANKS = [
  "A",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K",
] as const;
export const SUITS = ["♥", "♠", "♦", "♣"] as const;
export const MODE_META: Record<
  Mode,
  { name: string; subtitle: string; description: string }
> = {
  lady: {
    name: "小姐牌",
    subtitle: "微醺经典",
    description: "熟悉的聚会暗号，让每一张牌都有故事。",
  },
  queen: {
    name: "大姐牌",
    subtitle: "气场全开",
    description: "今晚你来定规则，接住每一次即兴挑战。",
  },
  gentleman: {
    name: "少爷牌",
    subtitle: "玩心登场",
    description: "轻松破冰，和朋友一起把快乐拉满。",
  },
};
const rule = (rank: string, title: string, description: string): Rule => ({
  rank,
  title,
  description,
});
export const DEFAULT_RULES: Record<Mode, Rule[]> = {
  lady: [
    rule(
      "A",
      "指定一位",
      "选一位朋友，送上一句夸奖，再邀请 TA 喝一小口。茶、水、饮料都可以。",
    ),
    rule(
      "2",
      "小姐登场",
      "你成为本轮陪伴官。有人举杯时，陪 TA 碰杯；下一张 2 出现时交接。",
    ),
    rule("3", "照顾自己", "轮到你喝一小口，或分享一件今天开心的小事。"),
    rule("4", "安全着陆", "这张是休息牌，什么都不用做。把好运留给下一位。"),
    rule(
      "5",
      "照相机",
      "你获得一次「定格」机会。喊出照相机后大家保持动作，最后定住的人接受小挑战。",
    ),
    rule(
      "6",
      "逛逛果园",
      "说一个类别，大家轮流举例，不重复。卡住的朋友讲一个冷笑话。",
    ),
    rule(
      "7",
      "逢七过",
      "从你开始依次报数，遇到 7、7 的倍数或含 7 的数字就拍手。说错的人重新开局。",
    ),
    rule(
      "8",
      "暂停一下",
      "获得一张暂停券，需要休息时随时使用。也可以把它送给朋友。",
    ),
    rule(
      "9",
      "真心一句",
      "分享一个最近的小愿望。也可以邀请一位朋友回答一个友善的问题。",
    ),
    rule(
      "10",
      "悄悄模式",
      "你进入一轮悄悄模式，只能用动作交流；轮到自己再抽牌时结束。",
    ),
    rule("J", "左边的你", "和左手边的朋友碰杯，互相说一个对方的优点。"),
    rule("Q", "右边的你", "和右手边的朋友碰杯，问 TA 最近最想去哪里。"),
    rule(
      "K",
      "今晚的约定",
      "提出一条简单有趣的新规则，全员同意后执行，直到下一张 K 出现。",
    ),
  ],
  queen: [
    rule("A", "全场焦点", "用一个动作完成你的登场，全员一起模仿。"),
    rule(
      "2",
      "大姐登场",
      "本轮你是气氛主理人，大家给你取一个响亮的称号。下一张 2 出现时交接。",
    ),
    rule(
      "3",
      "夸夸接力",
      "从你开始，依次夸赞右边的人，每个人的夸奖都不能重复。",
    ),
    rule("4", "免战金牌", "获得一次免挑战机会，可以自己使用，也可以送给朋友。"),
    rule("5", "气场定格", "摆一个最有气场的姿势，全员模仿 5 秒。"),
    rule(
      "6",
      "大姐出题",
      "说一个轻松的类别，大家依次回答，不能重复；卡住就表演一个表情。",
    ),
    rule(
      "7",
      "节奏大师",
      "敲出一小段节奏，大家轮流接力模仿，看看谁最有音乐感。",
    ),
    rule("8", "优雅暂停", "全员休息一下、补一口水。聊天也算游戏的一部分。"),
    rule("9", "高光时刻", "分享一件让你觉得「我真厉害」的小事，大家为你鼓掌。"),
    rule(
      "10",
      "眼神会意",
      "和一位朋友只用眼神和手势沟通，让 TA 猜出你想到的动物。",
    ),
    rule("J", "最佳搭档", "邀请一位朋友，用三个词共同编一个小故事。"),
    rule("Q", "女王加冕", "全员为你送一句祝福，你选一句作为本轮口号。"),
    rule(
      "K",
      "新规发布",
      "提出一条友善的新规则，全员同意才生效；下一张 K 出现时更新。",
    ),
  ],
  gentleman: [
    rule(
      "A",
      "少爷请客",
      "请大家收下一句祝福，一起碰杯。喝什么、喝多少都由自己决定。",
    ),
    rule(
      "2",
      "少爷登场",
      "成为本轮快乐管家，负责给每一次好笑的瞬间鼓掌。下一张 2 时交接。",
    ),
    rule("3", "冷笑话时间", "说一个冷笑话，或分享一个最近看到的有趣段子。"),
    rule("4", "今天躺赢", "安心休息，把这一轮的好运送给下一位。"),
    rule("5", "表情管理", "用三种表情演绎「发现手机只剩 1% 电」，大家一起猜。"),
    rule("6", "脑洞接龙", "你说故事的第一句，大家每人接一句，一起把故事编完。"),
    rule(
      "7",
      "幸运数字",
      "选一个 2 到 9 的数字，依次报数，遇到它的倍数就拍手。",
    ),
    rule("8", "快乐补给", "给自己倒点水、伸个懒腰，也提醒身边的朋友休息一下。"),
    rule(
      "9",
      "秘密才艺",
      "展示一个十秒小才艺，唱歌、口哨、模仿都算；也可以分享一首喜欢的歌。",
    ),
    rule(
      "10",
      "默契考验",
      "和一位朋友同时说出一种水果，试三次看看能不能说中同一个。",
    ),
    rule("J", "兄弟碰杯", "邀请一位朋友碰杯，一起讲讲你们第一次认识时的故事。"),
    rule("Q", "绅士时刻", "真诚夸赞一位朋友，具体说说你欣赏 TA 的哪个地方。"),
    rule(
      "K",
      "派对导演",
      "设计一条轻松的新规则，全员同意后开始；下一张 K 时交接导演。",
    ),
  ],
};

/** A complete, shuffled pack. No future card order is sent by the room API. */
export function createDeck(mode: Mode, customRules?: Rule[]): GameCard[] {
  const rules = customRules ?? DEFAULT_RULES[mode];
  const deck = SUITS.flatMap((suit) =>
    RANKS.map((rank) => {
      const cardRule =
        rules.find((item) => item.rank === rank) ??
        DEFAULT_RULES[mode].find((item) => item.rank === rank)!;
      return { ...cardRule, suit, id: `${suit}${rank}` };
    }),
  );
  for (let i = deck.length - 1; i > 0; i--) {
    const max = 0x100000000;
    const ceiling = max - (max % (i + 1));
    const random = new Uint32Array(1);
    do {
      globalThis.crypto.getRandomValues(random);
    } while (random[0] >= ceiling);
    const j = random[0] % (i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}
