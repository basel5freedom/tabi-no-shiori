// DB 行 → フロントの Itinerary 形へ変換（共有 API 用）

interface SpotRow {
  id: string;
  order: number;
  kind: string | null;
  time: string | null;
  name: string;
  note: string | null;
  memo: string | null;
  is_ai_suggested: boolean;
}
interface TransitRow {
  id: string;
  order: number;
  mode: string | null;
  duration: string | null;
  note: string | null;
  memo: string | null;
}
interface DayRow {
  id: string;
  day_index: number;
  date: string;
  theme: string | null;
  spots: SpotRow[];
  transits: TransitRow[];
}

export function buildItinerary(it: Record<string, any>, dayRows: DayRow[]) {
  const days = [...dayRows]
    .sort((a, b) => a.day_index - b.day_index)
    .map((d) => {
      const items = [
        ...d.spots.map((s) => ({
          order: s.order,
          item: {
            id: s.id,
            type: 'spot' as const,
            kind:
              s.kind === 'hotel' || s.kind === 'departure' || s.kind === 'arrival' ? s.kind : 'spot',
            time: s.time ?? '',
            name: s.name,
            note: s.note ?? '',
            memo: s.memo ?? '',
            isAiSuggested: s.is_ai_suggested,
          },
        })),
        ...d.transits.map((t) => ({
          order: t.order,
          item: {
            id: t.id,
            type: 'transit' as const,
            mode: t.mode ?? '',
            duration: t.duration ?? '',
            note: t.note ?? '',
            memo: t.memo ?? '',
            needsReview: !t.mode,
          },
        })),
      ]
        .sort((a, b) => a.order - b.order)
        .map((x) => x.item);
      return { id: d.id, dayIndex: d.day_index, date: d.date, theme: d.theme ?? '', items };
    });

  return {
    id: it.id,
    title: it.title,
    input: {
      destinations: it.destination ?? [],
      startDate: it.start_date,
      endDate: it.end_date,
      arrivalTime: it.arrival_time ?? '',
      departureTime: it.departure_time ?? '',
      adults: it.adults,
      children: it.children ?? [],
      wishSpots: [],
      lodgings: [],
      departurePlace: '',
      arrivalPlace: '',
    },
    planMeta: it.plan_meta ?? null,
    days,
    packingNotes: it.packing_notes ?? '',
    createdAt: it.created_at,
  };
}
