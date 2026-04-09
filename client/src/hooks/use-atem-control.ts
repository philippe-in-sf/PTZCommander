import { useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { switcherApi } from "@/lib/api";
import { useWebSocket } from "@/lib/websocket";

export interface AtemInput {
  inputId: number;
  shortName: string;
  longName: string;
}

export interface AtemTransition {
  style: number;
  nextStyle: number;
  inTransition: boolean;
  position: number;
  remainingFrames: number;
  mixRate: number;
  dipRate: number;
  wipeRate: number;
  dveRate: number;
  previewEnabled: boolean;
}

export interface AtemFadeToBlack {
  isFullyBlack: boolean;
  inTransition: boolean;
  remainingFrames: number;
  rate: number;
}

export interface AtemMacroPlayer {
  isRunning: boolean;
  isWaiting: boolean;
  loop: boolean;
  macroIndex: number;
}

export interface AtemState {
  connected: boolean;
  programInput: number;
  previewInput: number;
  inTransition: boolean;
  transitionPosition: number;
  inputs: AtemInput[];
  transition: AtemTransition;
  fadeToBlack: AtemFadeToBlack;
  downstreamKeyers: any[];
  upstreamKeyers: any[];
  macroPlayer: AtemMacroPlayer;
  macros: any[];
  auxOutputs: number[];
}

const DEFAULT_TRANSITION: AtemTransition = {
  style: 0, nextStyle: 0, inTransition: false, position: 0, remainingFrames: 0,
  mixRate: 30, dipRate: 30, wipeRate: 30, dveRate: 30, previewEnabled: false,
};

const DEFAULT_FTB: AtemFadeToBlack = {
  isFullyBlack: false, inTransition: false, remainingFrames: 0, rate: 30,
};

const DEFAULT_MACRO_PLAYER: AtemMacroPlayer = {
  isRunning: false, isWaiting: false, loop: false, macroIndex: 0,
};

export const DEFAULT_ATEM_STATE: AtemState = {
  connected: false,
  programInput: 0,
  previewInput: 0,
  inTransition: false,
  transitionPosition: 0,
  inputs: [],
  transition: DEFAULT_TRANSITION,
  fadeToBlack: DEFAULT_FTB,
  downstreamKeyers: [],
  upstreamKeyers: [],
  macroPlayer: DEFAULT_MACRO_PLAYER,
  macros: [],
  auxOutputs: [],
};

export function useAtemControl() {
  const ws = useWebSocket();
  const [atemState, setAtemState] = useState<AtemState>(DEFAULT_ATEM_STATE);

  const { data: switchers = [] } = useQuery({
    queryKey: ["switchers"],
    queryFn: switcherApi.getAll,
  });

  const switcher = switchers[0] ?? null;

  const handleAtemState = useCallback((message: Record<string, unknown>) => {
    if (message.type === "atem_state") {
      setAtemState({
        connected: message.connected,
        programInput: message.programInput || 0,
        previewInput: message.previewInput || 0,
        inTransition: message.inTransition || false,
        transitionPosition: message.transitionPosition || 0,
        inputs: message.inputs || [],
        transition: message.transition || DEFAULT_TRANSITION,
        fadeToBlack: message.fadeToBlack || DEFAULT_FTB,
        downstreamKeyers: message.downstreamKeyers || [],
        upstreamKeyers: message.upstreamKeyers || [],
        macroPlayer: message.macroPlayer || DEFAULT_MACRO_PLAYER,
        macros: message.macros || [],
        auxOutputs: message.auxOutputs || [],
      });
    }
  }, []);

  useEffect(() => {
    ws.addMessageHandler(handleAtemState);
    return () => ws.removeMessageHandler(handleAtemState);
  }, [ws, handleAtemState]);

  useEffect(() => {
    if (switcher && switcher.status === "online") {
      switcherApi.getStatus(switcher.id).then((status) => {
        if (status.connected) setAtemState({ ...DEFAULT_ATEM_STATE, ...status });
      }).catch(console.error);
    }
  }, [switcher]);

  const send = useCallback((data: Record<string, any>) => ws.send(data), [ws]);
  const cut = useCallback(() => ws.send({ type: "atem_cut" }), [ws]);
  const auto = useCallback(() => ws.send({ type: "atem_auto" }), [ws]);
  const setProgramInput = useCallback((inputId: number) => ws.send({ type: "atem_program", inputId }), [ws]);
  const setPreviewInput = useCallback((inputId: number) => ws.send({ type: "atem_preview", inputId }), [ws]);

  const getInputLabel = useCallback((inputId: number): string => {
    const input = atemState.inputs.find(i => i.inputId === inputId);
    return input?.shortName || `Input ${inputId}`;
  }, [atemState.inputs]);

  const displayInputs = atemState.inputs.length > 0
    ? atemState.inputs.filter(i => i.inputId >= 1 && i.inputId <= 20)
    : Array.from({ length: 8 }, (_, i) => ({ inputId: i + 1, shortName: `Input ${i + 1}`, longName: `Input ${i + 1}` }));

  return {
    atemState,
    switcher,
    switchers,
    send,
    cut,
    auto,
    setProgramInput,
    setPreviewInput,
    getInputLabel,
    displayInputs,
  };
}
