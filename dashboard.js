const MENU_L1_KEY = "btc-menu-l1";
const MENU_L2_KEY = "btc-menu-l2";
const MENU_L3_KEY = "btc-menu-l3";
const MENU_L4_KEY = "btc-menu-l4";

const MENU_TREE = {
  market: {
    label: "Market",
    accent: "#0ecb81",
    accentDim: "rgba(14, 203, 129, 0.18)",
    children: {
      overview: {
        label: "Overview",
        accent: "#0ecb81",
        accentDim: "rgba(14, 203, 129, 0.18)",
        children: {
          spot: {
            label: "Spot Price",
            accent: "#0ecb81",
            accentDim: "rgba(14, 203, 129, 0.18)",
            onShow: () => window.refreshPriceChart?.(),
          },
          indicators: {
            label: "Indicators",
            accent: "#34d399",
            accentDim: "rgba(52, 211, 153, 0.18)",
            children: {
              "1h": {
                label: "1h",
                accent: "#34d399",
                accentDim: "rgba(52, 211, 153, 0.18)",
                onShow: () => {
                  window.loadMarketIndicators?.("1h");
                  window.decorateHelpLabels?.(
                    document.querySelector(
                      '#dashboard-market .menu-screen[data-l3="indicators"][data-l4="1h"]',
                    ),
                  );
                },
              },
              "4h": {
                label: "4h",
                accent: "#2dd4bf",
                accentDim: "rgba(45, 212, 191, 0.18)",
                onShow: () => {
                  window.loadMarketIndicators?.("4h");
                  window.decorateHelpLabels?.(
                    document.querySelector(
                      '#dashboard-market .menu-screen[data-l3="indicators"][data-l4="4h"]',
                    ),
                  );
                },
              },
              d: {
                label: "D",
                accent: "#14b8a6",
                accentDim: "rgba(20, 184, 166, 0.18)",
                onShow: () => {
                  window.loadMarketIndicators?.("d");
                  window.decorateHelpLabels?.(
                    document.querySelector(
                      '#dashboard-market .menu-screen[data-l3="indicators"][data-l4="d"]',
                    ),
                  );
                },
              },
            },
          },
        },
      },
      orderbook: {
        label: "Order Book",
        accent: "#00b8d4",
        accentDim: "rgba(0, 184, 212, 0.18)",
        children: {
          depth: {
            label: "Depth Chart",
            accent: "#00b8d4",
            accentDim: "rgba(0, 184, 212, 0.18)",
            onShow: () => window.refreshDepthChart?.(),
          },
          ladder: {
            label: "Ladder",
            accent: "#0891b2",
            accentDim: "rgba(8, 145, 178, 0.18)",
          },
        },
      },
    },
  },
  onchain: {
    label: "On Chain",
    accent: "#10b981",
    accentDim: "rgba(16, 185, 129, 0.18)",
    children: {
      overview: {
        label: "Overview",
        accent: "#10b981",
        accentDim: "rgba(16, 185, 129, 0.18)",
        children: {
          overview: {
            label: "Overview",
            accent: "#10b981",
            accentDim: "rgba(16, 185, 129, 0.18)",
            onShow: () => window.loadOnchainSection?.("overview"),
          },
        },
      },
      network: {
        label: "Network",
        accent: "#059669",
        accentDim: "rgba(5, 150, 105, 0.18)",
        children: {
          overview: {
            label: "Overview",
            accent: "#059669",
            accentDim: "rgba(5, 150, 105, 0.18)",
            onShow: () => window.loadOnchainSection?.("network"),
          },
        },
      },
      mining: {
        label: "Mining",
        accent: "#34d399",
        accentDim: "rgba(52, 211, 153, 0.18)",
        children: {
          overview: {
            label: "Overview",
            accent: "#34d399",
            accentDim: "rgba(52, 211, 153, 0.18)",
            onShow: () => window.loadOnchainSection?.("mining"),
          },
        },
      },
      fees: {
        label: "Fees",
        accent: "#6ee7b7",
        accentDim: "rgba(110, 231, 183, 0.18)",
        children: {
          overview: {
            label: "Overview",
            accent: "#6ee7b7",
            accentDim: "rgba(110, 231, 183, 0.18)",
            onShow: () => window.loadOnchainSection?.("fees"),
          },
        },
      },
      transactions: {
        label: "Transactions",
        accent: "#14b8a6",
        accentDim: "rgba(20, 184, 166, 0.18)",
        children: {
          overview: {
            label: "Overview",
            accent: "#14b8a6",
            accentDim: "rgba(20, 184, 166, 0.18)",
            onShow: () => window.loadOnchainSection?.("transactions"),
          },
        },
      },
      supply: {
        label: "Supply",
        accent: "#0d9488",
        accentDim: "rgba(13, 148, 136, 0.18)",
        children: {
          overview: {
            label: "Overview",
            accent: "#0d9488",
            accentDim: "rgba(13, 148, 136, 0.18)",
            onShow: () => window.loadOnchainSection?.("supply"),
          },
        },
      },
      addresses: {
        label: "Addresses",
        accent: "#2dd4bf",
        accentDim: "rgba(45, 212, 191, 0.18)",
        children: {
          overview: {
            label: "Overview",
            accent: "#2dd4bf",
            accentDim: "rgba(45, 212, 191, 0.18)",
            onShow: () => window.loadOnchainSection?.("addresses"),
          },
        },
      },
      lightning: {
        label: "Lightning",
        accent: "#facc15",
        accentDim: "rgba(250, 204, 21, 0.18)",
        children: {
          overview: {
            label: "Overview",
            accent: "#facc15",
            accentDim: "rgba(250, 204, 21, 0.18)",
            onShow: () => window.loadOnchainSection?.("lightning"),
          },
        },
      },
    },
  },
  exchanges: {
    label: "Exchanges",
    accent: "#6366f1",
    accentDim: "rgba(99, 102, 241, 0.18)",
    children: {
      overview: {
        label: "Overview",
        accent: "#6366f1",
        accentDim: "rgba(99, 102, 241, 0.18)",
        onShow: () => window.loadExchangesSection?.("overview"),
      },
      spot: {
        label: "Spot",
        accent: "#818cf8",
        accentDim: "rgba(129, 140, 248, 0.18)",
        onShow: () => window.loadExchangesSection?.("spot"),
      },
      perp: {
        label: "Perp",
        accent: "#a78bfa",
        accentDim: "rgba(167, 139, 250, 0.18)",
        onShow: () => window.loadExchangesSection?.("perp"),
      },
      volume: {
        label: "Volume",
        accent: "#4f46e5",
        accentDim: "rgba(79, 70, 229, 0.18)",
        onShow: () => window.loadExchangesSection?.("volume"),
      },
    },
  },
  derivatives: {
    label: "Derivatives",
    accent: "#f59e0b",
    accentDim: "rgba(245, 158, 11, 0.18)",
    children: {
      perp: {
        label: "Perp",
        accent: "#f59e0b",
        accentDim: "rgba(245, 158, 11, 0.18)",
        children: {
          price: {
            label: "Price & Basis",
            accent: "#f59e0b",
            accentDim: "rgba(245, 158, 11, 0.18)",
          },
          sentiment: {
            label: "Sentiment",
            accent: "#ea580c",
            accentDim: "rgba(234, 88, 12, 0.18)",
          },
          indicators: {
            label: "Indicators",
            accent: "#fb923c",
            accentDim: "rgba(251, 146, 60, 0.18)",
          },
        },
      },
      futures: {
        label: "Futures",
        accent: "#ea580c",
        accentDim: "rgba(234, 88, 12, 0.18)",
        children: {
          contracts: {
            label: "Contracts",
            accent: "#ea580c",
            accentDim: "rgba(234, 88, 12, 0.18)",
            onShow: () => window.refreshDeliveryCurve?.(),
          },
        },
      },
      options: {
        label: "Options",
        accent: "#fbbf24",
        accentDim: "rgba(251, 191, 36, 0.18)",
        children: {
          volatility: {
            label: "Volatility",
            accent: "#fbbf24",
            accentDim: "rgba(251, 191, 36, 0.18)",
            onShow: () => window.refreshOptionsVolCharts?.(),
          },
          oi: {
            label: "Open Interest",
            accent: "#facc15",
            accentDim: "rgba(250, 204, 21, 0.18)",
            onShow: () => window.refreshOptionsOiCharts?.(),
          },
        },
      },
    },
  },
  etf: {
    label: "ETFs",
    accent: "#3d9ef0",
    accentDim: "rgba(61, 158, 240, 0.18)",
    children: {
      holdings: {
        label: "Holdings",
        accent: "#3d9ef0",
        accentDim: "rgba(61, 158, 240, 0.18)",
        children: {
          summary: {
            label: "Summary",
            accent: "#3d9ef0",
            accentDim: "rgba(61, 158, 240, 0.18)",
          },
          chart: {
            label: "Flow Chart",
            accent: "#60a5fa",
            accentDim: "rgba(96, 165, 250, 0.18)",
            onShow: () => window.refreshEtfFlowChart?.(),
          },
          table: {
            label: "Fund Table",
            accent: "#818cf8",
            accentDim: "rgba(129, 140, 248, 0.18)",
          },
        },
      },
      flows: {
        label: "Flows",
        accent: "#818cf8",
        accentDim: "rgba(129, 140, 248, 0.18)",
        children: {
          table: {
            label: "Daily Table",
            accent: "#818cf8",
            accentDim: "rgba(129, 140, 248, 0.18)",
          },
        },
      },
    },
  },
  treasury: {
    label: "DATCO",
    accent: "#c084fc",
    accentDim: "rgba(192, 132, 252, 0.18)",
    children: {
      summary: {
        label: "Summary",
        accent: "#c084fc",
        accentDim: "rgba(192, 132, 252, 0.18)",
        children: {
          stats: {
            label: "Aggregate Stats",
            accent: "#c084fc",
            accentDim: "rgba(192, 132, 252, 0.18)",
            onShow: () => window.refreshTreasurySummaryCharts?.(),
          },
          dominance: {
            label: "Asset Dominance",
            accent: "#a78bfa",
            accentDim: "rgba(167, 139, 250, 0.18)",
          },
        },
      },
      companies: {
        label: "Companies",
        accent: "#f472b6",
        accentDim: "rgba(244, 114, 182, 0.18)",
        children: {
          rankings: {
            label: "Rankings",
            accent: "#f472b6",
            accentDim: "rgba(244, 114, 182, 0.18)",
          },
        },
      },
    },
  },
  stats: {
    label: "Stats",
    accent: "#38bdf8",
    accentDim: "rgba(56, 189, 248, 0.18)",
    children: {
      statistics: {
        label: "Statistics",
        accent: "#38bdf8",
        accentDim: "rgba(56, 189, 248, 0.18)",
        children: {
          panel: {
            label: "Summary",
            accent: "#38bdf8",
            accentDim: "rgba(56, 189, 248, 0.18)",
            onShow: () => window.refreshStatsCharts?.(),
          },
        },
      },
      risk: {
        label: "Risk",
        accent: "#0ea5e9",
        accentDim: "rgba(14, 165, 233, 0.18)",
        children: {
          panel: {
            label: "Metrics",
            accent: "#0ea5e9",
            accentDim: "rgba(14, 165, 233, 0.18)",
            onShow: () => window.refreshRiskCharts?.(),
          },
        },
      },
      var: {
        label: "VaR",
        accent: "#22d3ee",
        accentDim: "rgba(34, 211, 238, 0.18)",
        children: {
          panel: {
            label: "VaR Analysis",
            accent: "#22d3ee",
            accentDim: "rgba(34, 211, 238, 0.18)",
            onShow: () => window.refreshVarCharts?.(),
          },
        },
      },
      markov: {
        label: "Markov",
        accent: "#67e8f9",
        accentDim: "rgba(103, 232, 249, 0.18)",
        children: {
          panel: {
            label: "Transition Matrix",
            accent: "#67e8f9",
            accentDim: "rgba(103, 232, 249, 0.18)",
            onShow: () => window.refreshMarkovCharts?.(),
          },
        },
      },
    },
  },
  tradfi: {
    label: "TradFi",
    accent: "#94a3b8",
    accentDim: "rgba(148, 163, 184, 0.18)",
    children: {
      stocks: {
        label: "Stocks",
        accent: "#64748b",
        accentDim: "rgba(100, 116, 139, 0.18)",
        children: {
          indices: {
            label: "Indices",
            accent: "#64748b",
            accentDim: "rgba(100, 116, 139, 0.18)",
            onShow: () => window.loadTradfiSection?.("stocks-indices"),
          },
          companies: {
            label: "Companies",
            accent: "#64748b",
            accentDim: "rgba(100, 116, 139, 0.18)",
            onShow: () => window.loadTradfiSection?.("stocks-companies"),
          },
        },
      },
      futures: {
        label: "Futures",
        accent: "#78716c",
        accentDim: "rgba(120, 113, 108, 0.18)",
        children: {
          overview: {
            label: "Overview",
            accent: "#78716c",
            accentDim: "rgba(120, 113, 108, 0.18)",
            onShow: () => window.loadTradfiSection?.("futures"),
          },
        },
      },
      rates: {
        label: "Rates & Bonds",
        accent: "#6b7280",
        accentDim: "rgba(107, 114, 128, 0.18)",
        children: {
          overview: {
            label: "Overview",
            accent: "#6b7280",
            accentDim: "rgba(107, 114, 128, 0.18)",
            onShow: () => window.loadTradfiSection?.("rates"),
          },
        },
      },
      currencies: {
        label: "Currencies",
        accent: "#71717a",
        accentDim: "rgba(113, 113, 122, 0.18)",
        children: {
          overview: {
            label: "Overview",
            accent: "#71717a",
            accentDim: "rgba(113, 113, 122, 0.18)",
            onShow: () => window.loadTradfiSection?.("currencies"),
          },
        },
      },
      commodities: {
        label: "Commodities",
        accent: "#a8a29e",
        accentDim: "rgba(168, 162, 158, 0.18)",
        children: {
          overview: {
            label: "Overview",
            accent: "#a8a29e",
            accentDim: "rgba(168, 162, 158, 0.18)",
            onShow: () => window.loadTradfiSection?.("commodities"),
          },
        },
      },
      sectors: {
        label: "Sectors",
        accent: "#9ca3af",
        accentDim: "rgba(156, 163, 175, 0.18)",
        children: {
          overview: {
            label: "Overview",
            accent: "#9ca3af",
            accentDim: "rgba(156, 163, 175, 0.18)",
            onShow: () => window.loadTradfiSection?.("sectors"),
          },
        },
      },
      energy: {
        label: "Energy",
        accent: "#eab308",
        accentDim: "rgba(234, 179, 8, 0.18)",
        children: {
          overview: {
            label: "Overview",
            accent: "#eab308",
            accentDim: "rgba(234, 179, 8, 0.18)",
            onShow: () => window.loadTradfiSection?.("energy"),
          },
        },
      },
    },
  },
  defi: {
    label: "DeFi",
    accent: "#a855f7",
    accentDim: "rgba(168, 85, 247, 0.18)",
    children: {
      wrapped: {
        label: "Wrapped BTC",
        accent: "#f59e0b",
        accentDim: "rgba(245, 158, 11, 0.18)",
        children: {
          overview: {
            label: "Overview",
            accent: "#f59e0b",
            accentDim: "rgba(245, 158, 11, 0.18)",
            onShow: () => window.loadDefiSection?.("wrapped"),
          },
        },
      },
      stables: {
        label: "Stables",
        accent: "#22c55e",
        accentDim: "rgba(34, 197, 94, 0.18)",
        children: {
          overview: {
            label: "Overview",
            accent: "#22c55e",
            accentDim: "rgba(34, 197, 94, 0.18)",
            onShow: () => window.loadDefiSection?.("stables"),
          },
        },
      },
      bridges: {
        label: "Bridges",
        accent: "#38bdf8",
        accentDim: "rgba(56, 189, 248, 0.18)",
        children: {
          overview: {
            label: "Overview",
            accent: "#38bdf8",
            accentDim: "rgba(56, 189, 248, 0.18)",
            onShow: () => window.loadDefiSection?.("bridges"),
          },
        },
      },
      lending: {
        label: "Lending",
        accent: "#818cf8",
        accentDim: "rgba(129, 140, 248, 0.18)",
        children: {
          overview: {
            label: "Overview",
            accent: "#818cf8",
            accentDim: "rgba(129, 140, 248, 0.18)",
            onShow: () => window.loadDefiSection?.("lending"),
          },
        },
      },
      liquidity: {
        label: "Liquidity",
        accent: "#e879f9",
        accentDim: "rgba(232, 121, 249, 0.18)",
        children: {
          overview: {
            label: "Overview",
            accent: "#e879f9",
            accentDim: "rgba(232, 121, 249, 0.18)",
            onShow: () => window.loadDefiSection?.("liquidity"),
          },
        },
      },
      staking: {
        label: "Staking",
        accent: "#fb923c",
        accentDim: "rgba(251, 146, 60, 0.18)",
        children: {
          overview: {
            label: "Overview",
            accent: "#fb923c",
            accentDim: "rgba(251, 146, 60, 0.18)",
            onShow: () => window.loadDefiSection?.("staking"),
          },
        },
      },
    },
  },
  macro: {
    label: "Macro",
    accent: "#14b8a6",
    accentDim: "rgba(20, 184, 166, 0.18)",
    children: {
      rates: {
        label: "Rates",
        accent: "#0d9488",
        accentDim: "rgba(13, 148, 136, 0.18)",
        children: {
          overview: {
            label: "Overview",
            accent: "#0d9488",
            accentDim: "rgba(13, 148, 136, 0.18)",
            onShow: () => window.loadMacroSection?.("rates"),
          },
        },
      },
      dollar: {
        label: "Dollar",
        accent: "#2dd4bf",
        accentDim: "rgba(45, 212, 191, 0.18)",
        children: {
          overview: {
            label: "Overview",
            accent: "#2dd4bf",
            accentDim: "rgba(45, 212, 191, 0.18)",
            onShow: () => window.loadMacroSection?.("dollar"),
          },
        },
      },
      liquidity: {
        label: "Liquidity",
        accent: "#5eead4",
        accentDim: "rgba(94, 234, 212, 0.18)",
        children: {
          overview: {
            label: "Overview",
            accent: "#5eead4",
            accentDim: "rgba(94, 234, 212, 0.18)",
            onShow: () => window.loadMacroSection?.("liquidity"),
          },
        },
      },
      risk: {
        label: "Risk",
        accent: "#f43f5e",
        accentDim: "rgba(244, 63, 94, 0.18)",
        children: {
          overview: {
            label: "Overview",
            accent: "#f43f5e",
            accentDim: "rgba(244, 63, 94, 0.18)",
            onShow: () => window.loadMacroSection?.("risk"),
          },
        },
      },
      inflation: {
        label: "Inflation",
        accent: "#fb7185",
        accentDim: "rgba(251, 113, 133, 0.18)",
        children: {
          overview: {
            label: "Overview",
            accent: "#fb7185",
            accentDim: "rgba(251, 113, 133, 0.18)",
            onShow: () => window.loadMacroSection?.("inflation"),
          },
        },
      },
      commodities: {
        label: "Commodities",
        accent: "#fbbf24",
        accentDim: "rgba(251, 191, 36, 0.18)",
        children: {
          overview: {
            label: "Overview",
            accent: "#fbbf24",
            accentDim: "rgba(251, 191, 36, 0.18)",
            onShow: () => window.loadMacroSection?.("commodities"),
          },
        },
      },
    },
  },
  news: {
    label: "News",
    accent: "#f97316",
    accentDim: "rgba(249, 115, 22, 0.18)",
    children: {
      all: {
        label: "Headlines",
        accent: "#f97316",
        accentDim: "rgba(249, 115, 22, 0.18)",
        children: {
          overview: {
            label: "Overview",
            accent: "#f97316",
            accentDim: "rgba(249, 115, 22, 0.18)",
            onShow: () => window.loadNewsSection?.("all"),
          },
        },
      },
      market: {
        label: "Market",
        accent: "#ea580c",
        accentDim: "rgba(234, 88, 12, 0.18)",
        children: {
          overview: {
            label: "Overview",
            accent: "#ea580c",
            accentDim: "rgba(234, 88, 12, 0.18)",
            onShow: () => window.loadNewsSection?.("market"),
          },
        },
      },
      regulation: {
        label: "Regulation",
        accent: "#c2410c",
        accentDim: "rgba(194, 65, 12, 0.18)",
        children: {
          overview: {
            label: "Overview",
            accent: "#c2410c",
            accentDim: "rgba(194, 65, 12, 0.18)",
            onShow: () => window.loadNewsSection?.("regulation"),
          },
        },
      },
      institutions: {
        label: "Institutions",
        accent: "#fdba74",
        accentDim: "rgba(253, 186, 116, 0.18)",
        children: {
          overview: {
            label: "Overview",
            accent: "#fdba74",
            accentDim: "rgba(253, 186, 116, 0.18)",
            onShow: () => window.loadNewsSection?.("institutions"),
          },
        },
      },
      mining: {
        label: "Mining",
        accent: "#fed7aa",
        accentDim: "rgba(254, 215, 170, 0.18)",
        children: {
          overview: {
            label: "Overview",
            accent: "#fed7aa",
            accentDim: "rgba(254, 215, 170, 0.18)",
            onShow: () => window.loadNewsSection?.("mining"),
          },
        },
      },
      technology: {
        label: "Technology",
        accent: "#fb923c",
        accentDim: "rgba(251, 146, 60, 0.18)",
        children: {
          overview: {
            label: "Overview",
            accent: "#fb923c",
            accentDim: "rgba(251, 146, 60, 0.18)",
            onShow: () => window.loadNewsSection?.("technology"),
          },
        },
      },
      onchain: {
        label: "On-Chain",
        accent: "#f59e0b",
        accentDim: "rgba(245, 158, 11, 0.18)",
        children: {
          overview: {
            label: "Overview",
            accent: "#f59e0b",
            accentDim: "rgba(245, 158, 11, 0.18)",
            onShow: () => window.loadNewsSection?.("onchain"),
          },
        },
      },
      x: {
        label: "X",
        accent: "#1d9bf0",
        accentDim: "rgba(29, 155, 240, 0.18)",
        children: {
          overview: {
            label: "Overview",
            accent: "#1d9bf0",
            accentDim: "rgba(29, 155, 240, 0.18)",
            onShow: () => window.loadNewsSection?.("x"),
          },
        },
      },
    },
  },
};

const DASHBOARD_META = {
  market: {
    title: "BTC / USDT",
    subtitle: "Binance Spot · Real-time",
    pageTitle: "BTC/USDT — Live Market",
  },
  onchain: {
    title: "On Chain",
    subtitle: "Bitcoin mainnet · Mempool · Blockchain charts",
    pageTitle: "On Chain — Live Dashboard",
  },
  exchanges: {
    title: "BTC Exchanges",
    subtitle: "Cross-venue spot · perp · volume",
    pageTitle: "BTC Exchanges — Live Dashboard",
  },
  derivatives: {
    title: "BTC Derivatives",
    subtitle: "Perp · Futures · Options",
    pageTitle: "BTC Derivatives — Live Dashboard",
  },
  etf: {
    title: "ETFs",
    subtitle: "US Spot · Daily flows & AUM",
    pageTitle: "ETFs — Live Dashboard",
  },
  treasury: {
    title: "DATCO",
    subtitle: "Digital Asset Treasuries · Corporate holdings",
    pageTitle: "DATCO — Live Dashboard",
  },
  stats: {
    title: "BTC Stats",
    subtitle: "Statistics · Risk · VaR · Markov",
    pageTitle: "BTC Stats — Live Dashboard",
  },
  tradfi: {
    title: "TradFi",
    subtitle: "Stocks · Futures · Rates · FX · Commodities",
    pageTitle: "TradFi Markets — Live Dashboard",
  },
  defi: {
    title: "Bitcoin DeFi",
    subtitle: "Wrapped BTC · Stables · Bridges · Lending",
    pageTitle: "Bitcoin DeFi — Live Dashboard",
  },
  macro: {
    title: "BTC Macro",
    subtitle: "Rates · Dollar · Liquidity · Risk",
    pageTitle: "BTC Macro — Live Dashboard",
  },
  news: {
    title: "BTC News",
    subtitle: "Bitcoin-centric headlines by topic",
    pageTitle: "BTC News — Live Dashboard",
  },
};

const LEGACY_L2 = {
  market: { st1: "overview", st2: "orderbook", overview: "overview", orderbook: "orderbook" },
  onchain: {
    st1: "overview",
    st2: "network",
    st3: "mining",
    st4: "fees",
    st5: "transactions",
    st6: "supply",
    st7: "addresses",
    st8: "lightning",
    overview: "overview",
    network: "network",
    mining: "mining",
    fees: "fees",
    transactions: "transactions",
    supply: "supply",
    addresses: "addresses",
    lightning: "lightning",
  },
  exchanges: {
    st1: "overview",
    st2: "spot",
    st3: "perp",
    st4: "volume",
    overview: "overview",
    spot: "spot",
    perp: "perp",
    volume: "volume",
  },
  derivatives: {
    st1: "perp",
    st2: "futures",
    st3: "options",
    perp: "perp",
    futures: "futures",
    options: "options",
    indicators: "perp",
    perpetuals: "perp",
  },
  etf: { st1: "holdings", st2: "flows", holdings: "holdings", flows: "flows" },
  treasury: { st1: "summary", st2: "companies", summary: "summary", companies: "companies" },
  stats: {
    st1: "statistics",
    st2: "risk",
    st3: "var",
    st4: "markov",
    statistics: "statistics",
    risk: "risk",
    var: "var",
    markov: "markov",
  },
  tradfi: {
    st1: "stocks",
    st2: "futures",
    st3: "rates",
    st4: "currencies",
    st5: "commodities",
    st6: "sectors",
    st7: "energy",
    stocks: "stocks",
    futures: "futures",
    rates: "rates",
    currencies: "currencies",
    commodities: "commodities",
    sectors: "sectors",
    energy: "energy",
  },
  defi: {
    st1: "wrapped",
    st2: "stables",
    st3: "bridges",
    st4: "lending",
    st5: "liquidity",
    st6: "staking",
    wrapped: "wrapped",
    stables: "stables",
    bridges: "bridges",
    lending: "lending",
    liquidity: "liquidity",
    staking: "staking",
    hub: "wrapped",
  },
  macro: {
    st1: "rates",
    st2: "dollar",
    st3: "liquidity",
    st4: "risk",
    st5: "inflation",
    st6: "commodities",
    rates: "rates",
    dollar: "dollar",
    liquidity: "liquidity",
    risk: "risk",
    inflation: "inflation",
    commodities: "commodities",
  },
  news: {
    st1: "all",
    st2: "market",
    st3: "regulation",
    st4: "institutions",
    st5: "mining",
    st6: "technology",
    st7: "onchain",
    st8: "x",
    all: "all",
    market: "market",
    regulation: "regulation",
    institutions: "institutions",
    mining: "mining",
    technology: "technology",
    onchain: "onchain",
    x: "x",
    headlines: "all",
  },
};

const LEGACY_L3 = {
  "market/overview": { st1: "spot", spot: "spot" },
  "market/orderbook": { st1: "depth", depth: "depth", ladder: "ladder" },
  "derivatives/perp": { st1: "price", price: "price", sentiment: "sentiment", indicators: "indicators" },
  "derivatives/futures": { contracts: "contracts" },
  "derivatives/options": { st1: "volatility", volatility: "volatility", oi: "oi" },
  "etf/holdings": { st1: "summary", summary: "summary", chart: "chart", table: "table" },
  "etf/flows": { table: "table" },
  "treasury/summary": { st1: "stats", stats: "stats", dominance: "dominance" },
  "treasury/companies": { rankings: "rankings" },
  "stats/statistics": { panel: "panel" },
  "stats/risk": { panel: "panel" },
  "stats/var": { panel: "panel" },
  "stats/markov": { panel: "panel" },
  "tradfi/stocks": { overview: "indices", indices: "indices", companies: "companies" },
  "tradfi/futures": { overview: "overview" },
  "tradfi/rates": { overview: "overview" },
  "tradfi/currencies": { overview: "overview" },
  "tradfi/commodities": { overview: "overview" },
  "tradfi/sectors": { overview: "overview" },
  "tradfi/energy": { overview: "overview" },
  "defi/wrapped": { overview: "overview" },
  "defi/stables": { overview: "overview" },
  "defi/bridges": { overview: "overview" },
  "defi/lending": { overview: "overview" },
  "defi/liquidity": { overview: "overview" },
  "defi/staking": { overview: "overview" },
  "defi/hub": { panel: "overview" },
  "onchain/overview": { overview: "overview" },
  "onchain/network": { overview: "overview" },
  "onchain/mining": { overview: "overview" },
  "onchain/fees": { overview: "overview" },
  "onchain/transactions": { overview: "overview" },
  "onchain/supply": { overview: "overview" },
  "onchain/addresses": { overview: "overview" },
  "onchain/lightning": { overview: "overview" },
  "macro/rates": { overview: "overview" },
  "macro/dollar": { overview: "overview" },
  "macro/liquidity": { overview: "overview" },
  "macro/risk": { overview: "overview" },
  "macro/inflation": { overview: "overview" },
  "macro/commodities": { overview: "overview" },
  "news/all": { overview: "overview" },
  "news/market": { overview: "overview" },
  "news/regulation": { overview: "overview" },
  "news/institutions": { overview: "overview" },
  "news/mining": { overview: "overview" },
  "news/technology": { overview: "overview" },
  "news/onchain": { overview: "overview" },
  "news/x": { overview: "overview" },
};

const LEGACY_L4 = {
  "market/overview/indicators": { "1h": "1h", "4h": "4h", d: "d", daily: "d" },
};

function l1Node(l1) {
  return MENU_TREE[l1];
}

function l2Node(l1, l2) {
  return l1Node(l1)?.children?.[l2];
}

function l3Node(l1, l2, l3) {
  return l2Node(l1, l2)?.children?.[l3];
}

function l4Node(l1, l2, l3, l4) {
  return l3Node(l1, l2, l3)?.children?.[l4];
}

function l2HasChildren(l1, l2) {
  const children = l2Node(l1, l2)?.children;
  return !!(children && Object.keys(children).length);
}

function l3HasChildren(l1, l2, l3) {
  const children = l3Node(l1, l2, l3)?.children;
  return !!(children && Object.keys(children).length);
}

function firstKey(obj) {
  return obj ? Object.keys(obj)[0] : null;
}

function normalizeL2(l1, l2) {
  const node = l1Node(l1);
  if (!node?.children) return null;
  if (l2 && node.children[l2]) return l2;
  const legacy = LEGACY_L2[l1];
  if (legacy && l2 && legacy[l2]) return legacy[l2];
  return firstKey(node.children);
}

function normalizeL3(l1, l2, l3) {
  const node = l2Node(l1, l2);
  if (!node?.children) return null;
  if (l3 && node.children[l3]) return l3;
  const legacy = LEGACY_L3[`${l1}/${l2}`];
  if (legacy && l3 && legacy[l3]) return legacy[l3];
  return firstKey(node.children);
}

function normalizeL4(l1, l2, l3, l4) {
  const node = l3Node(l1, l2, l3);
  if (!node?.children) return null;
  if (l4 && node.children[l4]) return l4;
  const legacy = LEGACY_L4[`${l1}/${l2}/${l3}`];
  if (legacy && l4 && legacy[l4]) return legacy[l4];
  return firstKey(node.children);
}

function applyMenuTheme(l1, l2, l3, l4) {
  const tree = document.getElementById("menu-tree");
  const l1n = l1Node(l1);
  const l3n = l3Node(l1, l2, l3);
  const l4n = l4Node(l1, l2, l3, l4);
  if (!tree || !l1n) return;

  tree.dataset.l1 = l1;
  tree.dataset.l2 = l2 || "";
  tree.dataset.l3 = l3 || "";
  tree.dataset.l4 = l4 || "";

  tree.style.setProperty("--menu-accent", l1n.accent);
  tree.style.setProperty("--menu-accent-dim", l1n.accentDim);
  tree.style.setProperty("--menu-l2-accent", l2Node(l1, l2)?.accent || l1n.accent);
  tree.style.setProperty(
    "--menu-l3-accent",
    l3n?.accent || l2Node(l1, l2)?.accent || l1n.accent,
  );
  tree.style.setProperty(
    "--menu-l3-accent-dim",
    l3n?.accentDim || l2Node(l1, l2)?.accentDim || l1n.accentDim,
  );
  tree.style.setProperty(
    "--menu-l4-accent",
    l4n?.accent || l3n?.accent || l2Node(l1, l2)?.accent || l1n.accent,
  );
  tree.style.setProperty(
    "--menu-l4-accent-dim",
    l4n?.accentDim || l3n?.accentDim || l2Node(l1, l2)?.accentDim || l1n.accentDim,
  );
}

function renderLevelNav(slotId, level, l1, l2, activeId, onSelect, parentL3) {
  const slot = document.getElementById(slotId);
  if (!slot) return;

  let items = null;
  let label = "";

  if (level === 2) {
    items = l1Node(l1)?.children;
    label = l1Node(l1)?.label + " sections";
  } else if (level === 3) {
    items = l2Node(l1, l2)?.children;
    label = l2Node(l1, l2)?.label + " views";
  } else if (level === 4) {
    items = l3Node(l1, l2, parentL3)?.children;
    label = l3Node(l1, l2, parentL3)?.label + " timeframes";
  }

  slot.innerHTML = "";
  if (!items || Object.keys(items).length === 0) {
    slot.hidden = true;
    return;
  }

  slot.hidden = false;

  const nav = document.createElement("nav");
  nav.className = `dashboard-nav menu-l${level}`;

  Object.entries(items).forEach(([id, item]) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className =
      `dash-tab dash-tab--l${level}` + (id === activeId ? " active" : "");
    btn.textContent = item.label;
    btn.dataset.menuId = id;
    btn.style.setProperty("--sub-accent", item.accent);
    btn.style.setProperty("--sub-accent-dim", item.accentDim);
    btn.addEventListener("click", () => onSelect(id));
    nav.appendChild(btn);
  });

  nav.setAttribute("aria-label", label);
  slot.appendChild(nav);
}

function updateBreadcrumb() {}

function hideLevel3Nav() {
  const slot = document.getElementById("menu-l3-slot");
  if (slot) {
    slot.innerHTML = "";
    slot.hidden = true;
  }
}

function hideLevel4Nav() {
  const slot = document.getElementById("menu-l4-slot");
  if (slot) {
    slot.innerHTML = "";
    slot.hidden = true;
  }
}

function showScreen(l1, l2, l3, l4) {
  document.querySelectorAll(".menu-screen").forEach((el) => {
    if (el.dataset.l1 !== l1 || el.dataset.l2 !== l2) {
      el.hidden = true;
      return;
    }

    let match = true;

    if (l2HasChildren(l1, l2)) {
      match = el.dataset.l3 === l3;
      if (l3HasChildren(l1, l2, l3)) {
        match = match && el.dataset.l4 === l4;
      } else if (el.dataset.l4) {
        match = false;
      }
    } else if (el.dataset.l3) {
      match = false;
    }

    el.hidden = !match;
  });
}

function scrollActiveTabIntoView(level) {
  const container =
    level === 1
      ? document.querySelector(".menu-l1")
      : document.getElementById(`menu-l${level}-slot`)?.querySelector(".dashboard-nav");
  const active = container?.querySelector(".dash-tab.active");
  if (active) {
    active.scrollIntoView({ inline: "nearest", block: "nearest", behavior: "smooth" });
  }
}

function refreshActiveDashboardCharts() {
  const l1 = MenuController.l1;
  window.refreshPriceChart?.();
  window.refreshDepthChart?.();
  const byL1 = {
    onchain: () => window.refreshOnchainData?.(),
    exchanges: () => window.loadExchangesDashboard?.(),
    derivatives: () => {
      window.refreshDeliveryCurve?.();
      window.refreshOptionsVolCharts?.();
      window.refreshOptionsOiCharts?.();
    },
    etf: () => window.loadEtfDashboard?.(),
    treasury: () => window.loadTreasuryDashboard?.(),
    stats: () => {
      window.refreshStatsCharts?.();
      window.refreshRiskCharts?.();
      window.refreshVarCharts?.();
      window.refreshMarkovCharts?.();
    },
    tradfi: () => window.loadTradfiDashboard?.(),
    defi: () => window.loadDefiDashboard?.(),
    macro: () => window.loadMacroDashboard?.(),
    news: () => window.loadNewsDashboard?.(),
  };
  byL1[l1]?.();
}

let orientationRefreshTimer = null;

function scheduleOrientationRefresh() {
  clearTimeout(orientationRefreshTimer);
  orientationRefreshTimer = setTimeout(() => {
    refreshActiveDashboardCharts();
  }, 200);
}

function runOnShow(l1, l2, l3, l4) {
  if (l3HasChildren(l1, l2, l3)) {
    const node = l4Node(l1, l2, l3, l4);
    if (node?.onShow) {
      requestAnimationFrame(() => node.onShow());
    }
    return;
  }

  if (l2HasChildren(l1, l2)) {
    const node = l3Node(l1, l2, l3);
    if (node?.onShow) {
      requestAnimationFrame(() => node.onShow());
    }
    return;
  }

  const node = l2Node(l1, l2);
  if (node?.onShow) {
    requestAnimationFrame(() => node.onShow());
  }
}

const MenuController = {
  l1: "market",
  l2: null,
  l3: null,
  l4: null,

  setLevel4(l4) {
    const l1 = this.l1;
    const l2 = normalizeL2(l1, this.l2);
    const l3 = normalizeL3(l1, l2, this.l3);
    if (!l3HasChildren(l1, l2, l3)) return;

    const activeL4 = normalizeL4(l1, l2, l3, l4);
    if (!activeL4) return;

    this.l2 = l2;
    this.l3 = l3;
    this.l4 = activeL4;

    localStorage.setItem(MENU_L4_KEY, activeL4);
    window.setActiveIndicatorTimeframe?.(activeL4);

    showScreen(l1, l2, l3, activeL4);
    renderLevelNav("menu-l4-slot", 4, l1, l2, activeL4, (id) =>
      this.setLevel4(id),
    l3);
    applyMenuTheme(l1, l2, l3, activeL4);
    updateBreadcrumb(l1, l2, l3, activeL4);
    runOnShow(l1, l2, l3, activeL4);
    requestAnimationFrame(() => scrollActiveTabIntoView(4));
  },

  setLevel3(l3) {
    const l1 = this.l1;
    const l2 = normalizeL2(l1, this.l2);
    const activeL3 = normalizeL3(l1, l2, l3);
    if (!activeL3) return;

    this.l2 = l2;
    this.l3 = activeL3;

    localStorage.setItem(MENU_L2_KEY, l2);
    localStorage.setItem(MENU_L3_KEY, activeL3);

    renderLevelNav("menu-l3-slot", 3, l1, l2, activeL3, (id) =>
      this.setLevel3(id),
    );

    if (l3HasChildren(l1, l2, activeL3)) {
      const savedL4 = localStorage.getItem(MENU_L4_KEY);
      this.setLevel4(normalizeL4(l1, l2, activeL3, savedL4));
      return;
    }

    this.l4 = null;
    localStorage.removeItem(MENU_L4_KEY);
    hideLevel4Nav();
    showScreen(l1, l2, activeL3);
    applyMenuTheme(l1, l2, activeL3);
    updateBreadcrumb(l1, l2, activeL3);
    runOnShow(l1, l2, activeL3);
    requestAnimationFrame(() => scrollActiveTabIntoView(3));
  },

  setLevel2(l2) {
    const l1 = this.l1;
    const activeL2 = normalizeL2(l1, l2);
    if (!activeL2) return;

    this.l2 = activeL2;
    localStorage.setItem(MENU_L2_KEY, activeL2);

    renderLevelNav("menu-l2-slot", 2, l1, null, activeL2, (id) =>
      this.setLevel2(id),
    );

    if (!l2HasChildren(l1, activeL2)) {
      this.l3 = null;
      this.l4 = null;
      localStorage.removeItem(MENU_L3_KEY);
      localStorage.removeItem(MENU_L4_KEY);
      hideLevel3Nav();
      hideLevel4Nav();
      showScreen(l1, activeL2);
      applyMenuTheme(l1, activeL2);
      updateBreadcrumb(l1, activeL2);
      runOnShow(l1, activeL2);
      requestAnimationFrame(() => scrollActiveTabIntoView(2));
      return;
    }

    const savedL3 = localStorage.getItem(MENU_L3_KEY);
    const defaultL3 = normalizeL3(l1, activeL2, savedL3);
    this.setLevel3(defaultL3);
  },

  setLevel1(l1) {
    if (!l1Node(l1)) return;
    this.l1 = l1;

    const savedL2 = localStorage.getItem(MENU_L2_KEY);
    const savedL3 = localStorage.getItem(MENU_L3_KEY);
    const activeL2 = normalizeL2(l1, savedL2);

    localStorage.setItem(MENU_L1_KEY, l1);

    document.querySelectorAll(".dash-tab--l1").forEach((tab) => {
      tab.classList.toggle("active", tab.dataset.dashboard === l1);
    });

    document.querySelectorAll(".dashboard-view").forEach((view) => {
      view.hidden = view.id !== `dashboard-${l1}`;
    });

    const meta = DASHBOARD_META[l1] || DASHBOARD_META.market;
    const subtitle = document.querySelector(".subtitle");
    const title = document.querySelector(".logo h1");
    if (subtitle) subtitle.textContent = meta.subtitle;
    if (title) title.textContent = meta.title;
    document.title = meta.pageTitle;

    const marketMeta = document.getElementById("header-market-meta");
    const derivativesMeta = document.getElementById("header-derivatives-meta");
    const etfMeta = document.getElementById("header-etf-meta");
    const treasuryMeta = document.getElementById("header-treasury-meta");
    const dashboardMeta = document.getElementById("header-dashboard-meta");
    const usesDashboardMeta = [
      "onchain", "exchanges", "stats", "tradfi", "defi", "macro", "news",
    ];
    if (marketMeta) marketMeta.hidden = l1 !== "market";
    if (derivativesMeta) derivativesMeta.hidden = l1 !== "derivatives";
    if (etfMeta) etfMeta.hidden = l1 !== "etf";
    if (treasuryMeta) treasuryMeta.hidden = l1 !== "treasury";
    if (dashboardMeta) dashboardMeta.hidden = !usesDashboardMeta.includes(l1);

    if (l1 === "onchain" && typeof loadOnchainDashboard === "function") {
      loadOnchainDashboard();
    }
    if (l1 === "etf" && typeof loadEtfDashboard === "function") loadEtfDashboard();
    if (l1 === "treasury" && typeof loadTreasuryDashboard === "function") {
      loadTreasuryDashboard();
    }
    if (l1 === "derivatives" && typeof loadDerivativesExtra === "function") {
      loadDerivativesExtra();
    }
    if (l1 === "stats" && typeof loadBtcStats === "function") {
      loadBtcStats();
    }
    if (l1 === "tradfi" && typeof loadTradfiDashboard === "function") {
      loadTradfiDashboard();
    }
    if (l1 === "defi" && typeof loadDefiDashboard === "function") {
      loadDefiDashboard();
    }
    if (l1 === "macro" && typeof loadMacroDashboard === "function") {
      loadMacroDashboard();
    }
    if (l1 === "news" && typeof loadNewsDashboard === "function") {
      loadNewsDashboard();
    }
    if (l1 === "exchanges" && typeof loadExchangesDashboard === "function") {
      loadExchangesDashboard();
    }

    this.setLevel2(activeL2);
    requestAnimationFrame(() => scrollActiveTabIntoView(1));
  },
};

let menuInitialized = false;

function initDashboardSwitcher() {
  if (menuInitialized) return;
  menuInitialized = true;

  window.addEventListener("orientationchange", scheduleOrientationRefresh);

  const tree = document.getElementById("menu-tree");
  if (tree) {
    tree.addEventListener("click", (event) => {
      const l1Tab = event.target.closest(".dash-tab--l1");
      if (l1Tab?.dataset.dashboard) {
        MenuController.setLevel1(l1Tab.dataset.dashboard);
      }
    });
  }

  const savedL1 = localStorage.getItem(MENU_L1_KEY);
  const validL1 = Object.keys(MENU_TREE);
  MenuController.setLevel1(validL1.includes(savedL1) ? savedL1 : "market");
}

window.MenuController = MenuController;

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initDashboardSwitcher);
} else {
  initDashboardSwitcher();
}