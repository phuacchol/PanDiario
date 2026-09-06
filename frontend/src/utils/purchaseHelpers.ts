// Funciones puras (sin SQLite/React) usadas por deletePurchase/loadPurchases
// en DataContext.tsx, separadas en su propio archivo .ts para poder
// probarlas de forma aislada con Node -DataContext.tsx es un .tsx que
// además importa expo-sqlite/@react-native-community/netinfo, módulos
// nativos que no pueden cargarse fuera de un runtime de Expo/React Native-.

// Nunca deja el stock en negativo al descontar un ingreso eliminado.
export function clampStockAfterDeletion(currentStock: number, deletedQty: number): number {
  return Math.max(0, currentStock - deletedQty);
}

// El backend aún no expone un DELETE para /purchases: una lectura remota
// en segundo plano que llegue después de una eliminación local traería de
// vuelta el registro ya borrado si no se excluye explícitamente aquí.
export function excludeDeletedPurchases<T extends { id: string }>(remote: T[], deletedIds: Set<string>): T[] {
  return remote.filter((p) => !deletedIds.has(p.id));
}
