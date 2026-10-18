export interface MinimaxVoice {
  voice_id: string;
  voice_name?: string;
  description?: string[];
  created_time: string;
  voice_type: "system_voice" | "voice_cloning" | "voice_generation";
}
