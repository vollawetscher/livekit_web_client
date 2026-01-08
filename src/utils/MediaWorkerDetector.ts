import { Participant } from 'livekit-client';

export interface TranscriptionChannel {
  language: string;
  status: 'active' | 'inactive' | 'error';
}

export interface MediaWorker {
  identity: string;
  name: string;
  type: 'transcription' | 'recording' | 'sip' | 'other';
  transcriptionChannels: TranscriptionChannel[];
  participant: Participant;
}

export interface WorkerMetadata {
  type?: string;
  languages?: string[];
  capabilities?: string[];
  agent?: string;
}

export function isMediaWorker(participant: Participant): boolean {
  const identity = participant.identity?.toLowerCase() || '';
  const name = participant.name?.toLowerCase() || '';

  return (
    identity.includes('agent') ||
    identity.includes('transcription') ||
    identity.includes('recorder') ||
    identity.includes('media-worker') ||
    identity.includes('sip-') ||
    name.includes('agent') ||
    name.includes('transcription') ||
    name.includes('recorder') ||
    name.includes('sip')
  );
}

export function parseWorkerMetadata(participant: Participant): WorkerMetadata {
  try {
    if (participant.metadata) {
      const parsed = JSON.parse(participant.metadata);
      return {
        type: parsed.type,
        languages: parsed.languages || [],
        capabilities: parsed.capabilities || [],
        agent: parsed.agent,
      };
    }
  } catch (err) {
    console.warn('Failed to parse worker metadata:', err);
  }

  return {};
}

export function detectMediaWorkerType(participant: Participant): MediaWorker['type'] {
  const identity = participant.identity?.toLowerCase() || '';
  const name = participant.name?.toLowerCase() || '';
  const metadata = parseWorkerMetadata(participant);

  if (metadata.type === 'transcription' || identity.includes('transcription') || name.includes('transcription')) {
    return 'transcription';
  }

  if (metadata.type === 'recording' || identity.includes('recorder') || name.includes('recorder')) {
    return 'recording';
  }

  if (identity.includes('sip-') || name.includes('sip')) {
    return 'sip';
  }

  return 'other';
}

export function extractTranscriptionChannels(participant: Participant): TranscriptionChannel[] {
  const metadata = parseWorkerMetadata(participant);

  if (!metadata.languages || metadata.languages.length === 0) {
    return [];
  }

  return metadata.languages.map(language => ({
    language: language.toUpperCase(),
    status: 'active' as const,
  }));
}

export function detectMediaWorkers(participants: Participant[]): MediaWorker[] {
  const workers: MediaWorker[] = [];

  for (const participant of participants) {
    if (!isMediaWorker(participant)) {
      continue;
    }

    const type = detectMediaWorkerType(participant);
    const transcriptionChannels = type === 'transcription'
      ? extractTranscriptionChannels(participant)
      : [];

    workers.push({
      identity: participant.identity,
      name: participant.name || participant.identity,
      type,
      transcriptionChannels,
      participant,
    });
  }

  return workers;
}

export function filterHumanParticipants(participants: Participant[]): Participant[] {
  return participants.filter(p => !isMediaWorker(p));
}
