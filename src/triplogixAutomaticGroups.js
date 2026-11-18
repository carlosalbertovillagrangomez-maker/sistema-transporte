// Agrupador por hora oficial y conductor propuesto en la programación.
// El orden y la geometría siguen resolviéndose con el algoritmo existente.
export const bucketByTimeAndDriver = (employees = [], timeOf, normalizeDriver) => {
  const buckets = new Map();
  for (const employee of employees) {
    const tKey = timeOf(employee);
    const driverKey = normalizeDriver(employee?.aiDriver || '');
    const key = tKey + '|' + driverKey;
    if (!buckets.has(key)) buckets.set(key, { tKey, employees: [] });
    buckets.get(key).employees.push(employee);
  }
  return [...buckets.values()];
};
