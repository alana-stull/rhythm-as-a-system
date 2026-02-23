import { createBrowserRouter } from "react-router";
import { DashboardLayout } from "./components/DashboardLayout";
import { TodayView } from "./components/TodayView";
import { HistoryView } from "./components/HistoryView";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: DashboardLayout,
    children: [
      {
        index: true,
        Component: TodayView,
      },
      {
        path: "history",
        Component: HistoryView,
      },
    ],
  },
]);
