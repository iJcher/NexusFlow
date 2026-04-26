export interface VariableItem {
  key: string
  label: string
  type: string
  category: 'node' | 'input' | 'session' | 'system'
}
