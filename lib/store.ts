'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { EditDay, Plan, PlanSpot, TripInput } from './types';

const emptyInput: TripInput = {
  destinations: [],
  startDate: '',
  endDate: '',
  arrivalTime: '午後',
  departureTime: '午後',
  adults: 2,
  children: [],
  wishSpots: [],
  lodgings: [],
  departurePlace: '',
  arrivalPlace: '',
};

interface DraftState {
  input: TripInput;
  plans: Plan[];
  selectedPlanIndex: number | null;
  days: EditDay[];
  /** 直近に発行された PIN と、それがどのしおりのものか（完成画面での表示用。localStorage に保持） */
  lastPin: string | null;
  lastPinId: string | null;

  setInput: (patch: Partial<TripInput>) => void;
  resetInput: () => void;
  setPlans: (plans: Plan[]) => void;
  updatePlanSpots: (index: number, spots: PlanSpot[]) => void;
  selectPlan: (index: number, days: EditDay[]) => void;
  setDays: (days: EditDay[]) => void;
  setLastPin: (pin: string | null, itineraryId?: string | null) => void;
  clearDraft: () => void;
}

export const useDraft = create<DraftState>()(
  persist(
    (set) => ({
      input: emptyInput,
      plans: [],
      selectedPlanIndex: null,
      days: [],
      lastPin: null,
      lastPinId: null,

      setInput: (patch) => set((s) => ({ input: { ...s.input, ...patch } })),
      resetInput: () => set({ input: emptyInput }),
      setPlans: (plans) => set({ plans, selectedPlanIndex: null, days: [] }),
      updatePlanSpots: (index, spots) =>
        set((s) => ({
          plans: s.plans.map((p, i) => (i === index ? { ...p, spots } : p)),
        })),
      selectPlan: (index, days) => set({ selectedPlanIndex: index, days }),
      setDays: (days) => set({ days }),
      setLastPin: (pin, itineraryId) => set({ lastPin: pin, lastPinId: itineraryId ?? null }),
      clearDraft: () =>
        set({ input: emptyInput, plans: [], selectedPlanIndex: null, days: [] }),
    }),
    {
      name: 'shiori:draft',
      version: 3,
      partialize: (s) => ({
        input: s.input,
        plans: s.plans,
        selectedPlanIndex: s.selectedPlanIndex,
        days: s.days,
        lastPin: s.lastPin,
        lastPinId: s.lastPinId,
      }),
      // 旧バージョンの保存データに新しいキー（lodgings 等）が無くても壊れないようにする
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<DraftState>;
        return {
          ...current,
          ...p,
          input: { ...emptyInput, ...(p.input ?? {}) },
        };
      },
    },
  ),
);
