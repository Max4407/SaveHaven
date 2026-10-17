import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const balanceHistory = [
  { month: "May", balance: 3180 },
  { month: "Jun", balance: 3460 },
  { month: "Jul", balance: 3375 },
  { month: "Aug", balance: 3890 },
  { month: "Sep", balance: 4210 },
  { month: "Oct", balance: 4820 },
];

const savingsGoals = [
  { name: "New bike", saved: 450, target: 800 },
  { name: "Emergency fund", saved: 1200, target: 3000 },
  { name: "Weekend trip", saved: 275, target: 600 },
  { name: "Laptop upgrade", saved: 620, target: 1400 },
];

function formatDollars(value: number) {
  return `$${value.toLocaleString()}`;
}

export function DashboardPage() {
  return (
    <main className="dashboard-page savings-page">
      <header className="topbar">
        <div className="page-heading">
          <span className="page-mark" aria-hidden="true">S</span>
          <div>
            <p className="eyebrow">Bank & goals</p>
            <h1>Your money, at a glance.</h1>
            <p>See the bigger picture, then check in on each savings goal.</p>
          </div>
        </div>
        <span className="sandbox-pill"><span /> Fictional demo data</span>
      </header>

      <section className="panel money-history-panel" aria-label="Money over time">
        <div className="panel-heading money-history-heading">
          <div>
            <p className="eyebrow">Money over time</p>
            <h2>Balance history</h2>
          </div>
          <div className="balance-change">
            <strong>+$1,640</strong>
            <span>over 6 months</span>
          </div>
        </div>

        <div className="money-chart" aria-label="Balance history from May through October">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={balanceHistory} margin={{ top: 24, right: 16, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="balanceFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#4d8a6a" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#4d8a6a" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#e5e7df" strokeDasharray="3 5" vertical={false} />
              <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: "#7b7d75", fontSize: 11 }} />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: "#7b7d75", fontSize: 11 }}
                tickFormatter={(value) => `$${Number(value) / 1000}k`}
                width={48}
              />
              <Tooltip
                formatter={(value) => [formatDollars(Number(value)), "Balance"]}
                contentStyle={{ borderRadius: 10, border: "1px solid #dfe2d9", boxShadow: "0 12px 30px rgba(31,44,38,.1)" }}
              />
              <Area
                type="monotone"
                dataKey="balance"
                stroke="#356b4d"
                fill="url(#balanceFill)"
                strokeWidth={3}
                activeDot={{ r: 5, fill: "#356b4d", stroke: "#fbfcf8", strokeWidth: 3 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="savings-goals-section" aria-labelledby="savings-goals-heading">
        <div className="goals-heading">
          <div>
            <p className="eyebrow">Saving goals</p>
            <h2 id="savings-goals-heading">What you’re saving for</h2>
          </div>
          <span>{savingsGoals.length} active goals</span>
        </div>

        <div className="goal-card-grid">
          {savingsGoals.map((goal) => {
            const progress = Math.round((goal.saved / goal.target) * 100);

            return (
              <article className="savings-goal-card" key={goal.name}>
                <span className="goal-card-icon" aria-hidden="true">◎</span>
                <h3>{goal.name}</h3>
                <p><strong>{formatDollars(goal.saved)}</strong> saved</p>
                <div
                  className="progress-track"
                  role="progressbar"
                  aria-label={`${goal.name} savings progress`}
                  aria-valuemin={0}
                  aria-valuemax={goal.target}
                  aria-valuenow={goal.saved}
                >
                  <span style={{ width: `${progress}%` }} />
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
