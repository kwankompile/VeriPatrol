import { Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Button } from '@mui/material';

export function SuccessDialog({ controller, msg }) {
  return (
    <Dialog
      open={controller.showSuccessModal}
      onClose={controller.handleModalClose}
      aria-labelledby="success-dialog-title"
      aria-describedby="success-dialog-description"
      PaperProps={{
        sx: {
          borderRadius: { xs: 3, sm: 3 },
          minWidth: { xs: 100, sm: 400 },
          margin: { xs: 0, sm: 'auto' },
          maxWidth: { xs: 400, sm: 400 },
          maxHeight: { xs: 'auto', sm: 'auto' },
          height: { xs: 'auto', sm: 'auto' }
        }
      }}
      fullWidth
      fullScreen={false}
    >
      <DialogTitle
        id="success-dialog-title"
        sx={{
          fontWeight: 600,
          fontSize: { xs: '1.25rem', sm: '1.5rem' },
          px: { xs: 2, sm: 3 },
          pt: { xs: 3, sm: 2 }
        }}
      >
        Success!
      </DialogTitle>
      <DialogContent sx={{ px: { xs: 2, sm: 3 } }}>
        <DialogContentText
          id="success-dialog-description"
          sx={{
            fontSize: { xs: '0.9rem', sm: '1rem' },
            lineHeight: 1.4
          }}
        >
          {msg}
        </DialogContentText>
      </DialogContent>
      <DialogActions
        sx={{
          p: { xs: 2, sm: 2 },
          px: { xs: 2, sm: 3 }
        }}
      >
        <Button
          onClick={controller.handleModalClose}
          variant="contained"
          color="secondary"
          sx={{
            borderRadius: 2,
            width: { xs: '100%', sm: 'auto' },
            py: { xs: 1.5, sm: 0.75 }
          }}
        >
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}
