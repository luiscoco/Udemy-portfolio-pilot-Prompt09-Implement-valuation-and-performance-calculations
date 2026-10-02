import { useEffect, useState } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useLocation } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { demoAskResponseSchema, healthResponseSchema, type DemoAskResponse, type HealthResponse, type HoldingDto, type NewsItemDto, type PortfolioDto } from '@portfolio-pilot/contracts';
import { demoNews, demoPortfolios, demoWatchlist } from './data/demo';
import { apiRequest } from './lib/api-client';
import { dateTime, signedPercent, usd } from './lib/format';
import { AuthenticationGate } from './auth';

export function App() { return <AuthenticationGate><Workspace /></AuthenticationGate>; }

const nav = [
  { path: '/', label: 'Dashboard', glyph: '▦' }, { path: '/portfolios', label: 'Portfolios', glyph: '▣' },
  { path: '/news', label: 'News', glyph: '▤' }, { path: '/assistant', label: 'Assistant', glyph: '✧' },
  { path: '/watchlist', label: 'Watchlist', glyph: '☆' }, { path: '/settings', label: 'Settings', glyph: '⚙' },
] as const;

export function DataState({ kind, title, children, retry }: { kind: 'empty' | 'loading' | 'error' | 'stale'; title: string; children?: React.ReactNode; retry?: () => void }) {
  return <div className={`data-state ${kind}`} role={kind === 'error' ? 'alert' : 'status'}><span className="state-mark" aria-hidden="true">{kind === 'error' ? '!' : kind === 'loading' ? '◌' : 'i'}</span><div><strong>{title}</strong>{children && <p>{children}</p>}</div>{retry && <button type="button" className="text-button" onClick={retry}>Try again</button>}</div>;
}
function Heading({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: React.ReactNode }) {
  return <div className="section-heading"><div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h2>{title}</h2></div>{action}</div>;
}
function PageTitle({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <div className="page-title"><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>;
}
function Change({ value, trend }: { value: string; trend: 'up' | 'down' | 'flat' }) {
  return <span className={`change ${trend}`}>{trend === 'up' ? '↗' : trend === 'down' ? '↘' : '—'} {signedPercent(value)}</span>;
}
function HoldingsTable({ holdings }: { holdings: HoldingDto[] }) {
  if (!holdings.length) return <DataState kind="empty" title="No holdings yet">Positions will appear here after a purchase is recorded.</DataState>;
  return <div className="table-scroll"><table><caption className="sr-only">Portfolio holdings</caption><thead><tr><th scope="col">Asset</th><th scope="col">Shares</th><th scope="col">Price</th><th scope="col">Day change</th><th scope="col">Market value</th><th scope="col">Allocation</th></tr></thead><tbody>{holdings.map(h => <tr key={h.symbol}><th scope="row"><span className="asset"><span className="asset-icon">{h.symbol[0]}</span><span><strong>{h.symbol}</strong><small>{h.name}</small></span></span></th><td>{h.shares}</td><td>{usd(h.price)}</td><td><Change value={h.dayChangePercent} trend={h.trend} /></td><td className="strong-cell">{usd(h.marketValue)}</td><td>{h.allocationPercent}%</td></tr>)}</tbody></table></div>;
}
function NewsList({ items }: { items: NewsItemDto[] }) {
  if (!items.length) return <DataState kind="empty" title="No news available">Articles will appear as providers supply them.</DataState>;
  return <div className="news-list">{items.map(item => <article className="news-item" key={item.id}><div className="news-meta"><span>{item.category}</span><span>{dateTime(item.publishedAt)}</span></div><h3>{item.title}</h3><p>{item.summary}</p><div className="news-foot"><span>{item.source} · Demo article</span><span>{item.symbols.join(' · ')}</span></div></article>)}</div>;
}
function ChatPanel({ id, interactive = false }: { id: string; interactive?: boolean }) {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<DemoAskResponse | null>(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  async function ask(event: React.FormEvent) {
    event.preventDefault();
    if (!question.trim() || pending) return;
    setPending(true); setAnswer(null); setError('');
    try {
      const result = await apiRequest('/api/demo/ask', demoAskResponseSchema, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: question.trim() }), timeoutMs: 25_000
      });
      setAnswer(result);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The assistant could not answer.'); }
    finally { setPending(false); }
  }
  return <div className="chat-panel"><span className="chat-symbol" aria-hidden="true">✧</span><h3>Your research companion</h3><p>{interactive ? 'Ask a general question. Portfolio context, current prices, and news sources are not connected yet.' : 'Open the Assistant screen to ask a question.'}</p><div className="prompt-samples"><span>What can this assistant help with?</span><span>Explain weighted average cost</span></div>{interactive ? <><form onSubmit={ask}><label htmlFor={id}>Ask the assistant</label><div className="chat-input"><input id={id} value={question} onChange={event => setQuestion(event.target.value)} placeholder="Type a question..." maxLength={500} required aria-describedby={`${id}-note`} /><button type="submit" disabled={pending || !question.trim()} aria-label="Send message">→</button></div></form><small id={`${id}-note`}>Up to 500 characters. One completed answer; no conversation history.</small>{pending && <DataState kind="loading" title="Answering">Please wait.</DataState>}{error && <DataState kind="error" title="Assistant unavailable">{error}</DataState>}{answer && <div className="chat-answer" role="status"><strong>{answer.mode === 'mock' ? 'Mock answer' : 'Claude answer'}</strong><p>{answer.answer}</p></div>}</> : <Link to="/assistant" className="section-link">Open Assistant →</Link>}</div>;
}
function Dashboard({ portfolio }: { portfolio: PortfolioDto }) {
  return <><PageTitle eyebrow="OVERVIEW" title="Good morning, Alex ✳" description="Here’s how your portfolio is looking today." /><div className="hero-grid"><div className="balance-card"><div className="balance-head"><span>Portfolio value</span><span className="pill">USD · DEMO</span></div><strong>{usd(portfolio.totalValue)}</strong><div className="balance-change"><span>{portfolio.dayChange.startsWith("-") ? "↘" : "↗"} {usd(portfolio.dayChange)} ({signedPercent(portfolio.dayChangePercent)})</span> today</div><svg className="trend-chart" viewBox="0 0 600 110" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="area" x1="0" x2="0" y1="0" y2="1"><stop stopColor="#a8e6d2" stopOpacity=".4"/><stop offset="1" stopColor="#a8e6d2" stopOpacity="0"/></linearGradient></defs><path d="M0 98 C55 82 70 103 110 75 S175 90 210 61 S260 73 300 48 S355 62 390 36 S455 48 490 24 S550 39 600 8 L600 110 L0 110Z" fill="url(#area)"/><path d="M0 98 C55 82 70 103 110 75 S175 90 210 61 S260 73 300 48 S355 62 390 36 S455 48 490 24 S550 39 600 8" fill="none" stroke="#b8f1dc" strokeWidth="3"/></svg></div><div className="metric-stack"><div className="metric"><span>Total return</span><strong>{usd(portfolio.totalReturn)}</strong><Change value={portfolio.totalReturnPercent} trend="up" /></div><div className="metric"><span>Cash balance</span><strong>{usd(portfolio.cashBalance)}</strong><small>Available in portfolio</small></div></div></div><div className="dashboard-grid"><div className="dashboard-main"><section className="card"><Heading eyebrow="YOUR ASSETS" title="Holdings" action={<Link to="/portfolios" className="section-link">View portfolio →</Link>} /><HoldingsTable holdings={portfolio.holdings} /></section><section className="card"><Heading eyebrow="MARKET PULSE" title="Latest news" action={<Link to="/news" className="section-link">All news →</Link>} /><NewsList items={demoNews.slice(0, 2)} /></section></div><aside className="dashboard-side"><section className="insight-card"><span className="insight-symbol">✧</span><span className="eyebrow">PORTFOLIO INSIGHT</span><h2>A clearer view of your investments</h2><p>See holdings, market context, and research in one place. All figures here are deterministic demo data.</p><Link to="/assistant">Explore assistant →</Link></section><section className="card"><Heading eyebrow="YOUR SPACE" title="Assistant" /><ChatPanel id="chat-preview" /></section></aside></div></>;
}
function Portfolios({ portfolio }: { portfolio: PortfolioDto }) {
  return <><PageTitle eyebrow="PORTFOLIOS" title="Your portfolios" description="A focused view of your demo positions and allocations." /><div className="summary-row"><div className="mini-stat"><span>Portfolio value</span><strong>{usd(portfolio.totalValue)}</strong></div><div className="mini-stat"><span>Total return</span><strong>{usd(portfolio.totalReturn)}</strong></div><div className="mini-stat"><span>Cash balance</span><strong>{usd(portfolio.cashBalance)}</strong></div></div><section className="card"><Heading eyebrow={portfolio.accountLabel.toUpperCase()} title={portfolio.name} /><HoldingsTable holdings={portfolio.holdings} /></section></>;
}
function News() { return <><PageTitle eyebrow="MARKET PULSE" title="Market news" description="Fictional headlines for exploring the news experience. This is not live reporting." /><section className="card"><Heading title="Latest stories" /><NewsList items={demoNews} /></section></>; }
function Assistant() { return <><PageTitle eyebrow="RESEARCH" title="Assistant" description="Ask a general question in this local development demo. Portfolio-aware research is coming later." /><section className="card assistant-page"><ChatPanel id="chat-page" interactive /></section></>; }
function Watchlist() { return <><PageTitle eyebrow="ON YOUR RADAR" title="Watchlist" description="Companies you are following in this demo." /><section className="card"><Heading title="Following" /><div className="watchlist">{demoWatchlist.map(item => <div className="watch-row" key={item.symbol}><div className="asset"><span className="asset-icon">{item.symbol[0] ?? '?'}</span><span><strong>{item.symbol}</strong><small>{item.name}</small></span></div><div><strong>{usd(item.price)}</strong><Change value={item.dayChangePercent} trend={item.trend}/></div></div>)}</div></section></>; }
function Settings() { return <><PageTitle eyebrow="PREFERENCES" title="Settings" description="The demo environment is ready for data and account features in upcoming milestones." /><section className="card settings"><Heading title="Environment" /><div><span>Data source</span><strong>Deterministic demo fixtures</strong></div><div><span>Display currency</span><strong>USD</strong></div><div><span>Time display</span><strong>UTC</strong></div><DataState kind="stale" title="Demo snapshot">Prices and headlines are fixed examples dated September 30, 2026.</DataState></section></>; }

function Workspace() {
  const [selected, setSelected] = useState(demoPortfolios[0]!.id);
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const portfolio = demoPortfolios.find(p => p.id === selected) ?? demoPortfolios[0]!;
  const health = useQuery<HealthResponse>({ queryKey: ['health'], queryFn: ({ signal }) => apiRequest<HealthResponse>('/api/health/live', healthResponseSchema, { signal, timeoutMs: 5000 }) });
  useEffect(() => setMenuOpen(false), [location.pathname]);
  useEffect(() => {
    if (!menuOpen) return;
    document.getElementById('mobile-close')?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setMenuOpen(false); document.getElementById('mobile-open')?.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [menuOpen]);
  return <div className="app-shell"><a href="#main-content" className="skip-link">Skip to main content</a><aside className={`sidebar ${menuOpen ? 'open' : ''}`} aria-label="Primary navigation"><div className="brand"><span className="brand-icon">P<span>↗</span></span><span>Portfolio<span className="brand-light">Pilot</span><small>INVEST WITH CLARITY</small></span><button className="mobile-close" id="mobile-close" type="button" aria-label="Close navigation" onClick={() => setMenuOpen(false)}>×</button></div><div className="nav-caption">WORKSPACE</div><nav aria-label="Main navigation">{nav.map(item => <NavLink key={item.path} end to={item.path} onClick={() => setMenuOpen(false)} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><span className="nav-glyph" aria-hidden="true">{item.glyph}</span>{item.label}</NavLink>)}</nav><div className="sidebar-bottom"><div className="demo-sidebar"><span className="demo-light"/><strong>Demo workspace</strong><p>Explore safely with sample market data.</p></div><div className="profile"><span className="avatar">AC</span><span><strong>Fixture persona</strong><small>Static screen fixture</small></span><span aria-hidden="true">⌄</span></div></div></aside>{menuOpen && <button type="button" className="backdrop" aria-label="Close navigation" onClick={() => setMenuOpen(false)} />}<div className="main-shell"><header className="topbar"><button className="menu-button" id="mobile-open" type="button" aria-label="Open navigation" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}>☰</button><div className="breadcrumb">Workspace <span>/</span> <strong>{nav.find(item => item.path === location.pathname)?.label ?? 'Dashboard'}</strong></div><div className="top-actions"><label htmlFor="portfolio-selector">Portfolio</label><select id="portfolio-selector" value={selected} onChange={e => setSelected(e.target.value)}>{demoPortfolios.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select><span className="top-avatar" aria-label="Static screen fixture: Fixture persona">AC</span></div></header><main id="main-content" tabIndex={-1}><div className="notice"><span className="demo-badge">● DEMO DATA</span><span>Fixed snapshot · {dateTime(portfolio.asOf)}</span><span className="api-status" role="status">{health.isPending ? 'Checking API…' : health.isError ? 'API unavailable' : 'API connected'}</span></div>{health.isError && <DataState kind="error" title="API connection unavailable" retry={() => void health.refetch()}>The demo pages still work. Live services are unavailable.</DataState>}<Routes><Route path="/" element={<Dashboard portfolio={portfolio} />} /><Route path="/portfolios" element={<Portfolios portfolio={portfolio} />} /><Route path="/news" element={<News />} /><Route path="/assistant" element={<Assistant />} /><Route path="/watchlist" element={<Watchlist />} /><Route path="/settings" element={<Settings />} /><Route path="*" element={<Navigate to="/" replace />} /></Routes><footer className="footer">PortfolioPilot · Demonstration data only. Not investment advice.</footer></main></div></div>;
}
