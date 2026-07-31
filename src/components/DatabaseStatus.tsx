import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { testDatabaseConnection } from "../services/supabaseClient";

type ConnectionStatus = "idle" | "testing" | "connected" | "error";

export const DatabaseStatus: React.FC = () => {
  const [status, setStatus] = useState<ConnectionStatus>("testing");

  useEffect(() => {
    let isMounted = true;
    let retryCount = 0;
    const maxRetries = 3;

    const testConnection = async () => {
      if (isMounted) {
        setStatus("testing");
      }

      try {
        const isConnected = await testDatabaseConnection();
        if (isMounted) {
          if (isConnected) {
            setStatus("connected");
          } else {
            setStatus("error");
          }
        }
      } catch (err) {
        if (isMounted) {
          retryCount++;
          if (retryCount < maxRetries) {
            // Retry after delay
            setTimeout(testConnection, 3000);
          } else {
            setStatus("error");
          }
        }
      }
    };

    // Delay initial test - give auth state time to settle
    setTimeout(testConnection, 2000);

    return () => {
      isMounted = false;
    };
  }, []);

  if (!import.meta.env.DEV) return null;

  const getColor = () => {
    switch (status) {
      case "connected":
        return "#22c55e"; // Green
      case "testing":
        return "#3b82f6"; // Blue
      case "error":
        return "#ef4444"; // Red
      default:
        return "#3b82f6";
    }
  };

  const getLabel = () => {
    switch (status) {
      case "connected":
        return "System online";
      case "testing":
        return "Checking connection…";
      case "error":
        return "Connection error";
      default:
        return "Checking connection…";
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0 }}
      animate={{ opacity: 1, scale: 1 }}
      className="fixed top-6 right-6 z-50 flex items-center gap-2 bg-white/90 backdrop-blur border border-slate-200 rounded-full px-3 py-1.5 shadow-sm"
    >
      {status === "testing" ? (
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
          className="w-4 h-4 rounded-full border-2"
          style={{
            borderColor: getColor(),
            borderTopColor: "transparent",
            borderRightColor: "transparent",
          }}
        />
      ) : (
        <motion.div
          animate={{ scale: [1, 1.2, 1] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="w-4 h-4 rounded-full"
          style={{ backgroundColor: getColor() }}
        />
      )}
      <span className="text-[11px] text-slate-500 font-medium">
        {getLabel()}
      </span>
    </motion.div>
  );
};

export default DatabaseStatus;
