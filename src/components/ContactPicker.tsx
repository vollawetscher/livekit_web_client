import { useState, useEffect } from 'react';
import { Phone, UserPlus, Trash2, Users } from 'lucide-react';

interface Contact {
  id: string;
  name: string;
  phoneNumber: string;
}

interface ContactPickerProps {
  onDial: (phoneNumber: string, contactName: string) => void;
  isDialing: boolean;
}

export default function ContactPicker({ onDial, isDialing }: ContactPickerProps) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [isSupported, setIsSupported] = useState(false);

  useEffect(() => {
    setIsSupported('contacts' in navigator && 'ContactsManager' in window);
  }, []);

  const handlePickContact = async () => {
    try {
      const props = ['name', 'tel'];
      const opts = { multiple: true };

      const contactsManager = (navigator as any).contacts;
      const selectedContacts = await contactsManager.select(props, opts);

      const newContacts: Contact[] = selectedContacts.flatMap((contact: any) => {
        if (!contact.tel || contact.tel.length === 0) return [];

        return contact.tel.map((tel: string) => ({
          id: `${contact.name?.[0] || 'Unknown'}-${tel}-${Date.now()}`,
          name: contact.name?.[0] || 'Unknown',
          phoneNumber: tel,
        }));
      });

      setContacts((prev) => {
        const existingNumbers = new Set(prev.map(c => c.phoneNumber));
        const uniqueNew = newContacts.filter(c => !existingNumbers.has(c.phoneNumber));
        return [...prev, ...uniqueNew];
      });
    } catch (error) {
      if (error instanceof Error && error.name !== 'AbortError') {
        console.error('Contact picker error:', error);
        alert('Failed to access contacts: ' + error.message);
      }
    }
  };

  const handleRemoveContact = (id: string) => {
    setContacts((prev) => prev.filter((c) => c.id !== id));
  };

  const handleDialContact = (contact: Contact) => {
    onDial(contact.phoneNumber, contact.name);
  };

  if (!isSupported) {
    return (
      <div className="bg-slate-800/50 rounded-lg border border-slate-700 p-4">
        <div className="text-center text-slate-400 text-sm">
          <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>Contact picker not supported on this device</p>
          <p className="text-xs mt-1">Available on Android Chrome & iOS Safari 14.5+</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-800/50 rounded-lg border border-slate-700 p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
          <Users className="w-4 h-4" />
          Phone Contacts
        </h3>
        <button
          onClick={handlePickContact}
          disabled={isDialing}
          className="px-3 py-1.5 rounded-lg font-medium text-xs flex items-center gap-1.5 transition-all bg-blue-600 hover:bg-blue-700 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <UserPlus className="w-3.5 h-3.5" />
          Add Contacts
        </button>
      </div>

      {contacts.length === 0 ? (
        <div className="text-center py-6 text-slate-400 text-sm">
          <p>No contacts added yet</p>
          <p className="text-xs mt-1">Tap "Add Contacts" to import from your phone</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {contacts.map((contact) => (
            <div
              key={contact.id}
              className="bg-slate-700/50 rounded-lg p-3 flex items-center justify-between gap-3 hover:bg-slate-700 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <p className="font-medium text-white text-sm truncate">{contact.name}</p>
                <p className="text-xs text-slate-400 font-mono truncate">{contact.phoneNumber}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleDialContact(contact)}
                  disabled={isDialing}
                  className="p-2 rounded-lg bg-green-600 hover:bg-green-700 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Phone className="w-4 h-4 text-white" />
                </button>
                <button
                  onClick={() => handleRemoveContact(contact.id)}
                  disabled={isDialing}
                  className="p-2 rounded-lg bg-red-600/20 hover:bg-red-600/30 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Trash2 className="w-4 h-4 text-red-400" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
