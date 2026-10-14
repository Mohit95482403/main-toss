/**
 * IRONMAN TOSS BOOK - Centralized Match Fixtures Dataset
 * Shared source of truth for Home Dashboard and Match Details page.
 */

(function () {
  'use strict';

  const DEMO_MATCHES = [
    {
      id: 'MATCH-2026-001',
      featured: true,
      competition: "ICC MEN'S T20 WORLD CUP",
      stage: 'Super 8 - Match 24',
      matchTitle: 'India vs Australia',
      teamOne: 'India',
      teamOneAbbr: 'IND',
      teamOneRate: 1.95,
      teamOneCaptain: 'Rohit Sharma',
      teamTwo: 'Australia',
      teamTwoAbbr: 'AUS',
      teamTwoRate: 1.90,
      teamTwoCaptain: 'Pat Cummins',
      scheduledTime: 'Today, 03:00 PM',
      lockCountdown: 'Locks in 12m',
      venue: 'Melbourne Cricket Ground, Melbourne',
      pitchCondition: 'Even bounce • Fast outfield',
      referee: 'Javagal Srinath (Match Referee)',
      status: 'live', // 'live' | 'upcoming' | 'completed'
      tossMarketStatus: 'Open • Locking 5m before toss',
      marketDescription: 'Official referee coin toss between India and Australia captains. Wagers apply strictly to which captain wins the coin toss call.',
      resultSummary: 'Match in progress • Toss locked • Awaiting live declaration'
    },
    {
      id: 'MATCH-2026-002',
      featured: false,
      competition: 'IPL 2026 - T20 LEAGUE',
      stage: 'League Match 38',
      matchTitle: 'Mumbai Indians vs Chennai Super Kings',
      teamOne: 'Mumbai Indians',
      teamOneAbbr: 'MI',
      teamOneRate: 1.90,
      teamOneCaptain: 'Hardik Pandya',
      teamTwo: 'Chennai Super Kings',
      teamTwoAbbr: 'CSK',
      teamTwoRate: 1.92,
      teamTwoCaptain: 'Ruturaj Gaikwad',
      scheduledTime: 'Today, 07:30 PM',
      venue: 'Wankhede Stadium, Mumbai',
      pitchCondition: 'Red soil surface • Heavy dew expected in second innings',
      referee: 'J. Madanagopal (Match Referee)',
      status: 'upcoming',
      tossMarketStatus: 'Open • Locks at 07:00 PM',
      marketDescription: 'El Clásico of IPL. Toss market closes 30 minutes before first ball.',
      resultSummary: 'Toss market opens 30 minutes before match time'
    },
    {
      id: 'MATCH-2026-003',
      featured: false,
      competition: "ICC MEN'S T20 WORLD CUP",
      stage: 'Super 8 - Match 26',
      matchTitle: 'England vs South Africa',
      teamOne: 'England',
      teamOneAbbr: 'ENG',
      teamOneRate: 1.88,
      teamOneCaptain: 'Jos Buttler',
      teamTwo: 'South Africa',
      teamTwoAbbr: 'SA',
      teamTwoRate: 1.94,
      teamTwoCaptain: 'Aiden Markram',
      scheduledTime: 'Tomorrow, 02:30 PM',
      venue: 'Kensington Oval, Barbados',
      pitchCondition: 'Hard surface • Good carry for pacers',
      referee: 'Sir Richie Richardson (Match Referee)',
      status: 'upcoming',
      tossMarketStatus: 'Scheduled • Opens 2h before match',
      marketDescription: 'High stakes Super 8 encounter. Toss winner expected to field.',
      resultSummary: 'Scheduled Group Stage Clash'
    },
    {
      id: 'MATCH-2026-004',
      featured: false,
      competition: 'BIG BASH LEAGUE 2026',
      stage: 'Opening Fixture',
      matchTitle: 'Sydney Sixers vs Perth Scorchers',
      teamOne: 'Sydney Sixers',
      teamOneAbbr: 'SYS',
      teamOneRate: 1.91,
      teamOneCaptain: 'Moises Henriques',
      teamTwo: 'Perth Scorchers',
      teamTwoAbbr: 'PRS',
      teamTwoRate: 1.91,
      teamTwoCaptain: 'Ashton Turner',
      scheduledTime: '16 Oct 2026, 01:45 PM',
      venue: 'Sydney Cricket Ground, Sydney',
      pitchCondition: 'Dry wicket with spin assistance in later overs',
      referee: 'Bob Parry (Match Referee)',
      status: 'upcoming',
      tossMarketStatus: 'Scheduled',
      marketDescription: 'BBL season opener. Rates even across both powerhouses.',
      resultSummary: 'BBL Season Opener Match'
    },
    {
      id: 'MATCH-2026-005',
      featured: false,
      competition: 'ASIA CUP T20 2026',
      stage: 'Super 4 Round',
      matchTitle: 'Pakistan vs Sri Lanka',
      teamOne: 'Pakistan',
      teamOneAbbr: 'PAK',
      teamOneRate: 1.88,
      teamOneCaptain: 'Babar Azam',
      teamTwo: 'Sri Lanka',
      teamTwoAbbr: 'SL',
      teamTwoRate: 1.92,
      teamTwoCaptain: 'Wanindu Hasaranga',
      scheduledTime: '14 Oct 2026, 07:00 PM',
      venue: 'R. Premadasa Stadium, Colombo',
      pitchCondition: 'Slow turning track',
      referee: 'Andy Pycroft (Match Referee)',
      status: 'completed',
      tossWinner: 'Sri Lanka',
      tossDecision: 'Elected to bat first',
      tossMarketStatus: 'Settled & Closed',
      marketDescription: 'Official toss completed and declared.',
      resultSummary: 'Sri Lanka won the toss and elected to bat first'
    },
    {
      id: 'MATCH-2026-006',
      featured: false,
      competition: 'INTERNATIONAL T20 SERIES',
      stage: '2nd T20I',
      matchTitle: 'New Zealand vs West Indies',
      teamOne: 'New Zealand',
      teamOneAbbr: 'NZ',
      teamOneRate: 1.90,
      teamOneCaptain: 'Mitchell Santner',
      teamTwo: 'West Indies',
      teamTwoAbbr: 'WI',
      teamTwoRate: 1.90,
      teamTwoCaptain: 'Rovman Powell',
      scheduledTime: '13 Oct 2026, 11:30 AM',
      venue: 'Eden Park, Auckland',
      pitchCondition: 'Short boundaries • Drop-in pitch',
      referee: 'Jeff Crowe (Match Referee)',
      status: 'completed',
      tossWinner: 'New Zealand',
      tossDecision: 'Elected to bowl first',
      tossMarketStatus: 'Settled & Closed',
      marketDescription: 'Official toss completed and declared.',
      resultSummary: 'New Zealand won the toss and elected to bowl'
    }
  ];

  function getMatchById(id) {
    if (!id) return null;
    return DEMO_MATCHES.find(m => m.id === id) || null;
  }

  // Export to window
  window.TossBookMatches = {
    getAll: () => DEMO_MATCHES,
    getById: getMatchById
  };
})();
