import type { SpotItem } from './types';

/** 出発地・到着地・宿泊先など、通常スポット以外の役割名（通常スポットは null） */
export function spotRoleLabel(item: SpotItem): string | null {
  switch (item.kind) {
    case 'departure':
      return '出発地';
    case 'arrival':
      return '到着地';
    case 'hotel':
      return '宿泊先';
    default:
      return null;
  }
}

/** 日をまたぐ移動や並べ替え対象になる通常スポットか */
export function isMovableSpot(item: SpotItem): boolean {
  return item.kind === 'spot';
}

/** DB などの文字列を SpotItem['kind'] に正規化 */
export function asSpotKind(v: string | null | undefined): SpotItem['kind'] {
  return v === 'hotel' || v === 'departure' || v === 'arrival' ? v : 'spot';
}

/** 備考／メモ欄の入力ヒント（種別ごと） */
export function spotNotePlaceholder(kind: SpotItem['kind']): string {
  switch (kind) {
    case 'departure':
      return '集合場所など';
    case 'arrival':
      return '解散場所・帰りの手段など';
    case 'hotel':
      return 'チェックイン時間・朝食の有無など';
    default:
      return '予約の有無・持ち物・拝観時間など';
  }
}
