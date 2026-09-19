import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

export const useCameraAddController = (repository) => {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  const [formData, setFormData] = useState({
    name: '',
    model: '',
    status: '',
    latitude: '',
    longitude: '',
    serial_number: ''
  });

  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [newCameraId, setNewCameraId] = useState(null);

  // Auto-redirect effect
  useEffect(() => {
    let timer;
    if (showSuccessModal) {
      timer = setTimeout(() => {
        handleModalClose();
      }, 2000);
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [showSuccessModal]);

  const handleChange = (field) => (event) => {
    setFormData({
      ...formData,
      [field]: event.target.value
    });
    if (errors[field]) {
      setErrors({
        ...errors,
        [field]: ''
      });
    }
  };

  const handleImageUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewUrl(reader.result);
        setFormData({ ...formData, profilePicture: file });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveImage = () => {
    setPreviewUrl(null);
    setFormData({ ...formData, profilePicture: null });
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const validate = () => {
    const newErrors = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Name is required';
    }

    if (!formData.model.trim()) {
      newErrors.model = 'Model is required';
    }

    if (!formData.status.trim()) {
      newErrors.status = 'Status is required';
    }

    if (!formData.latitude.trim()) {
      newErrors.latitude = 'Latitude is required';
    }

    if (!formData.longitude.trim()) {
      newErrors.role = 'Langitude is required';
    }

    if (!formData.serial_number.trim()) {
      newErrors.serial_number = 'Serial Number is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!validate()) {
      return;
    }

    try {
      setLoading(true);
      const newCamera = await repository.createCamera(formData);
      setNewCameraId(newCamera.data.id);
      setShowSuccessModal(true);
    } catch (error) {
      console.error('Failed to create camera:', error);
      alert('Failed to create camera: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    navigate('/admin/cameraManagement');
  };

  const handleModalClose = () => {
    setShowSuccessModal(false);
    if (newCameraId) {
      navigate(`/admin/cameraManagement/view/${newCameraId}`);
    } else {
      navigate('/admin/cameraManagement');
    }
    // navigate('/admin/cameraManagement');
  };

  return {
    formData,
    errors,
    loading,
    showSuccessModal,
    previewUrl,
    fileInputRef,
    handleChange,
    handleImageUpload,
    handleRemoveImage,
    handleSubmit,
    handleCancel,
    handleModalClose
  };
};
