import { useNavigate } from 'react-router-dom';
import StockSearchModal, { type SearchResult } from './StockSearchModal';

interface SearchModalProps {
  onClose: () => void;
}

export default function SearchModal({ onClose }: SearchModalProps) {
  const navigate = useNavigate();

  function handleSelect(result: SearchResult) {
    navigate(`/stock/${result.symbol}`);
    onClose();
  }

  return (
    <StockSearchModal
      title="Search"
      onClose={onClose}
      onSelect={handleSelect}
    />
  );
}
