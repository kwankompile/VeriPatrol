import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export const usePatrolLiveController = (repository) => {
  const navigate = useNavigate();
  const [patrols, setPatrols] = useState([]);
  const [selected, setSelected] = useState([]);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(5);
  const [filterText, setFilterText] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPatrols();
  }, []);

  const loadPatrols = async () => {
    try {
      setLoading(true);
      const data = await repository.getAllPatrolLives();
      setPatrols(data);
    } catch (error) {
      console.error('Failed to load patrols:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleChangePage = (event, newPage) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const handleSelectAllClick = (event) => {
    if (event.target.checked) {
      const newSelected = patrols.map((n) => n.id);
      setSelected(newSelected);
      return;
    }
    setSelected([]);
  };

  const handleRowClick = (event, id) => {
    const selectedIndex = selected.indexOf(id);
    let newSelected = [];

    if (selectedIndex === -1) {
      newSelected = newSelected.concat(selected, id);
    } else if (selectedIndex === 0) {
      newSelected = newSelected.concat(selected.slice(1));
    } else if (selectedIndex === selected.length - 1) {
      newSelected = newSelected.concat(selected.slice(0, -1));
    } else if (selectedIndex > 0) {
      newSelected = newSelected.concat(selected.slice(0, selectedIndex), selected.slice(selectedIndex + 1));
    }

    setSelected(newSelected);
  };

  const handleFilterChange = (text) => {
    setFilterText(text);
    setPage(0);
  };

  const handleAddPatrol = () => {
    navigate('/admin/patrolManagement/add');
  };

  const handleViewPatrol = (patrolId) => {
    navigate(`/admin/patrolManagement/view/${patrolId}`);
  };

  const handleEditPatrol = (patrolId) => {
    navigate(`/admin/patrolManagement/edit/${patrolId}`);
  };

  const handleDeletePatrol = async (patrolId) => {
    if (window.confirm('Are you sure you want to delete this patrol?')) {
      try {
        await repository.deletePatrol(patrolId);
        await loadPatrols();
      } catch (error) {
        console.error('Failed to delete patrol:', error);
        alert('Failed to delete patrol');
      }
    }
  };

  const isSelected = (id) => selected.indexOf(id) !== -1;

  const filteredPatrols = repository.filterPatrolLives(patrols, filterText);
  const paginatedPatrols = repository.paginatePatrolLives(filteredPatrols, page, rowsPerPage);

  return {
    patrols: paginatedPatrols,
    filteredCount: filteredPatrols.length,
    selected,
    page,
    rowsPerPage,
    filterText,
    loading,
    isSelected,
    handleChangePage,
    handleChangeRowsPerPage,
    handleSelectAllClick,
    handleRowClick,
    handleFilterChange,
    handleAddPatrol,
    handleViewPatrol,
    handleEditPatrol,
    handleDeletePatrol
  };
};
