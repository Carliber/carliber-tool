export type ConfigType = 'string' | 'boolean' | 'number' | 'json';

export interface ConfigSpec {
  label: string;
  type: ConfigType;
  desc: string;
  options?: { value: string; label: string }[];
  group: 'core' | 'display' | 'advanced';
}
