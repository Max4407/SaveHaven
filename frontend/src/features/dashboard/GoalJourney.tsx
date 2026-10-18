import { useEffect, useState } from "react";
import type { GameWallet, SavingsGoal } from "../../api/types";
import { goalJourney } from "./savingsJourney";

const dollars = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(cents / 100);

export function GoalJourney({ goal, weeklySavings, wallet }: { goal: SavingsGoal; weeklySavings: number | null; wallet?: GameWallet }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);
  const journey = goalJourney(goal, now);
  return (
    <div className="goal-journey" aria-label="Savings journey">
      <div className="goal-journey-time">
        <span><strong>{journey.complete ? "Goal reached!" : journey.week ? `Week ${journey.week} · Day ${journey.day}` : "Your savings journey"}</strong>{journey.totalWeeks && !journey.complete ? <small>of your {journey.totalWeeks}-week timeline</small> : null}</span>
        {wallet ? <span className="goal-xp" title="Your total town XP"><strong>✦ {wallet.xp.toLocaleString()} XP</strong><small>Town level {wallet.level}</small></span> : null}
        <span className="goal-days-left">{journey.complete ? "100% saved" : journey.overdue ? "Time to replan" : `${journey.daysLeft} ${journey.daysLeft === 1 ? "day" : "days"} left`}</span>
      </div>
      <ol className="goal-milestones" aria-label="Savings milestones">
        {[25, 50, 75, 100].map((percent) => {
          const reached = journey.ratio * 100 >= percent;
          const next = !journey.complete && percent === journey.nextMilestone;
          return <li key={percent} className={reached ? "reached" : next ? "next" : ""} aria-current={next ? "step" : undefined} title={`${percent}%: ${dollars(Math.ceil(goal.target_amount_cents * percent / 100))}${reached ? " saved" : " milestone"}`}><span aria-hidden="true">{reached ? "✓" : ""}</span><strong>{percent}%</strong><small>{reached ? "Reached" : next ? "Up next" : "Milestone"}</small></li>;
        })}
      </ol>
      <p className="goal-next-step">{journey.complete ? "You made it. Your goal is fully funded." : <><strong>{dollars(journey.toNextMilestone)}</strong> to your {journey.nextMilestone}% milestone.</>}</p>
      {weeklySavings !== null && !journey.complete ? <p className="goal-weekly-step">One week at a time: aim to save <strong>{dollars(weeklySavings)}</strong> this week.</p> : null}
      {journey.overdue ? <a className="text-button" href="#planner-heading">Review your target date →</a> : null}
    </div>
  );
}
