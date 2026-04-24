/**
 * aiteall-native — local Expo module.
 *
 * Exposes Swift-backed methods for:
 *   - Live Activity control (startFifteen / updateFifteen / endFifteen)
 *   - Manual widget reload (reloadWidget)
 *
 * Siri AppIntents ship inside this same module (TellAiteallIntent.swift)
 * but they don't need a JS surface — iOS discovers and donates them
 * automatically via AppShortcutsProvider.
 *
 * On non-iOS platforms (or in Expo Go without a dev build), every method
 * is a no-op so imports don't crash.
 */
import { Platform } from 'react-native';

interface AiteallNativeBridge {
  startFifteen(label: string, durationSeconds: number): Promise<boolean>;
  updateFifteen(label: string): Promise<boolean>;
  endFifteen(): Promise<boolean>;
  reloadWidget(): void;
}

const noop: AiteallNativeBridge = {
  startFifteen: async () => false,
  updateFifteen: async () => false,
  endFifteen: async () => false,
  reloadWidget: () => {},
};

let cached: AiteallNativeBridge | null = null;

function bridge(): AiteallNativeBridge {
  if (cached) return cached;
  if (Platform.OS !== 'ios') {
    cached = noop;
    return cached;
  }
  try {
    // expo-modules-core is a peer dep of every Expo SDK install; it may
    // not be importable statically in test envs. Use require so typecheck
    // doesn't depend on the native build graph.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const core = require('expo-modules-core');
    cached = core.requireNativeModule('AiteallNative') as AiteallNativeBridge;
  } catch {
    cached = noop;
  }
  return cached;
}

export const AiteallNative = {
  startFifteen: (label: string, durationSeconds: number) =>
    bridge().startFifteen(label, durationSeconds),
  updateFifteen: (label: string) => bridge().updateFifteen(label),
  endFifteen: () => bridge().endFifteen(),
  reloadWidget: () => bridge().reloadWidget(),
};
