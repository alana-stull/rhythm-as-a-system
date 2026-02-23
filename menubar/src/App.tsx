import React from "react";
import { usePolling } from "./hooks/usePolling";
import { PopoverCard } from "./components/PopoverCard";

export default function App() {
  const { data, lastUpdated, error, loading, refetch } = usePolling();

  return (
    <PopoverCard
      data={data}
      lastUpdated={lastUpdated}
      error={error}
      loading={loading}
      onRefresh={refetch}
    />
  );
}
