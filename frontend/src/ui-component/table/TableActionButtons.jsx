import PropTypes from 'prop-types';
import { Box, IconButton } from '@mui/material';
import { IconPencil as EditIcon, IconTrash as DeleteIcon, IconEye as ViewIcon } from '@tabler/icons-react';

export function TableActionButtons({ onView, onEdit, onDelete, viewLabel = 'View', editLabel = 'Edit', deleteLabel = 'Delete' }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', gap: 0.25 }}>
      {onView ? (
        <IconButton color="info" size="small" aria-label="view" title={viewLabel} onClick={onView}>
          <ViewIcon size={18} />
        </IconButton>
      ) : null}
      {onEdit ? (
        <IconButton color="warning" size="small" aria-label="edit" title={editLabel} onClick={onEdit}>
          <EditIcon size={18} />
        </IconButton>
      ) : null}
      {onDelete ? (
        <IconButton color="error" size="small" aria-label="delete" title={deleteLabel} onClick={onDelete}>
          <DeleteIcon size={18} />
        </IconButton>
      ) : null}
    </Box>
  );
}

TableActionButtons.propTypes = {
  onView: PropTypes.func,
  onEdit: PropTypes.func,
  onDelete: PropTypes.func,
  viewLabel: PropTypes.string,
  editLabel: PropTypes.string,
  deleteLabel: PropTypes.string
};
