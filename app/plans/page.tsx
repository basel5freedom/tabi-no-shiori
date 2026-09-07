'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useDraft } from '@/lib/store';
import { distributeSpotsToDays } from '@/lib/sample';
import { formatParty, formatRange } from '@/lib/format';
import { PlanCard } from '@/components/PlanCard';
import { DemoBanner } from '@/components/DemoBanner';

export default function PlansPage() {
  const router = useRouter();
  const { input, plans, selectPlan, updatePlanSpots } = useDraft();

  useEffect(() => {
    if (plans.length === 0) router.replace('/');
  }, [plans.length, router]);

  if (plans.length === 0) return null;

  function choose(index: number) {
    const days = distributeSpotsToDays(plans[index], input);
    selectPlan(index, days);
    router.push('/edit');
  }

  function removeSpot(index: number, name: string) {
    const next = plans[index].spots.filter((s) => s.name !== name);
    updatePlanSpots(index, next);
  }

  return (
    <div className="page">
      <h1>AI からの提案（5案）</h1>

      <div className="card">
        <div className="chips">
          <span className="chip">{input.destinations.join(' / ')}</span>
          <span className="chip">{formatRange(input.startDate, input.endDate)}</span>
          <span className="chip">{formatParty(input.adults, input.children)}</span>
        </div>
        {input.wishSpots.length > 0 && (
          <div className="chips" style={{ marginTop: 8 }}>
            {input.wishSpots.map((s) => (
              <span key={s} className="chip">{s}</span>
            ))}
          </div>
        )}
      </div>

      <DemoBanner />

      <p className="muted mt-lg">各案の「かんたんスケジュール」で1日の流れを確認できます。行きたくないスポットは × で外してから選んでください。</p>
      <div className="stack">
        {plans.map((p, i) => (
          <PlanCard key={i} plan={p} index={i} input={input} onSelect={choose} onRemoveSpot={removeSpot} />
        ))}
      </div>

      <button className="btn btn-ghost mt-lg" onClick={() => router.push('/')}>
        ← 入力に戻ってやり直す
      </button>
    </div>
  );
}
