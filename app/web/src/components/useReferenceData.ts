import { useQuery } from '@tanstack/react-query';
import { fetchReferenceData } from '../api/catalog';

export function useReferenceData() {
  return useQuery({
    queryKey: ['reference-data'],
    queryFn: fetchReferenceData,
    staleTime: 60 * 60 * 1000,
  });
}
