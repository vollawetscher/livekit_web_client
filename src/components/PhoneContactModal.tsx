import { useState, useEffect } from 'react';
import { X, Phone, User, FileText } from 'lucide-react';
import { PhoneContact, createPhoneContact, updatePhoneContact } from '../utils/supabase';

interface PhoneContactModalProps {
  currentUserId: string;
  contact?: PhoneContact;
  onClose: () => void;
  onSaved: () => void;
}

export default function PhoneContactModal({ currentUserId, contact, onClose, onSaved }: PhoneContactModalProps) {
  const [contactName, setContactName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (contact) {
      setContactName(contact.contact_name);
      setPhoneNumber(contact.phone_number);
      setNotes(contact.notes || '');
    }
  }, [contact]);

  const handleSave = async () => {
    if (!contactName.trim()) {
      setError('Contact name is required');
      return;
    }

    if (!phoneNumber.trim()) {
      setError('Phone number is required');
      return;
    }

    const phoneRegex = /^\+?[1-9]\d{1,14}$/;
    if (!phoneRegex.test(phoneNumber.replace(/[\s-()]/g, ''))) {
      setError('Please enter a valid phone number (E.164 format recommended)');
      return;
    }

    try {
      setIsSaving(true);
      setError('');

      if (contact?.id) {
        await updatePhoneContact(contact.id, {
          contact_name: contactName.trim(),
          phone_number: phoneNumber.trim(),
          notes: notes.trim(),
        });
      } else {
        await createPhoneContact({
          user_id: currentUserId,
          contact_name: contactName.trim(),
          phone_number: phoneNumber.trim(),
          notes: notes.trim(),
        });
      }

      onSaved();
      onClose();
    } catch (err) {
      console.error('Failed to save contact:', err);
      setError('Failed to save contact. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-800 rounded-lg max-w-md w-full p-6 shadow-xl">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white">
            {contact ? 'Edit Contact' : 'Add Phone Contact'}
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              <div className="flex items-center space-x-2">
                <User className="w-4 h-4" />
                <span>Contact Name</span>
              </div>
            </label>
            <input
              type="text"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              placeholder="e.g., John Doe"
              className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              <div className="flex items-center space-x-2">
                <Phone className="w-4 h-4" />
                <span>Phone Number</span>
              </div>
            </label>
            <input
              type="tel"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="e.g., +1234567890"
              className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
            />
            <p className="text-xs text-slate-400 mt-1">
              Include country code (e.g., +1 for US)
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              <div className="flex items-center space-x-2">
                <FileText className="w-4 h-4" />
                <span>Notes (Optional)</span>
              </div>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add any notes about this contact..."
              rows={3}
              className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          {error && (
            <div className="bg-red-500 bg-opacity-10 border border-red-500 rounded-lg p-3">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          <div className="flex space-x-3 pt-2">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? 'Saving...' : 'Save Contact'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
