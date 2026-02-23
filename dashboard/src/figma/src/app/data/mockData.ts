export interface CalendarEvent {
  id: string;
  title: string;
  time: string;
  duration: string;
  type: 'meeting' | 'focus' | 'break' | 'event';
}

export interface DashboardData {
  recoveryScore: number;
  exposureScore: number;
  rhythmScore: number;
  rhythmLabel: string;
  insight: string;
  suggestions: string[];
  calendarEvents: CalendarEvent[];
  date: string;
}

export const mockData: DashboardData = {
  recoveryScore: 82,
  exposureScore: 65,
  rhythmScore: 78,
  rhythmLabel: "Steady",
  insight: "Your energy and workload are well matched today.",
  suggestions: [
    "Start with one focused task before checking messages",
    "Use your steady energy for your most meaningful work",
    "Build in short transitions between activities"
  ],
  calendarEvents: [
    {
      id: '1',
      title: '1:1 with Sarah',
      time: '9:00 AM',
      duration: '30m',
      type: 'meeting'
    },
    {
      id: '2',
      title: 'Design Review',
      time: '10:30 AM',
      duration: '1h',
      type: 'meeting'
    },
    {
      id: '3',
      title: 'Focus Block',
      time: '2:00 PM',
      duration: '2h',
      type: 'focus'
    },
    {
      id: '4',
      title: 'Team Sync',
      time: '4:30 PM',
      duration: '30m',
      type: 'meeting'
    }
  ],
  date: 'Saturday, February 21'
};