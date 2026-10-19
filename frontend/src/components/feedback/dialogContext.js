import {createContext,useContext} from 'react';

export const DialogContext=createContext(null);

export function useDialog(){
  const value=useContext(DialogContext);
  if(!value)throw new Error('useDialog must be used inside DialogProvider');
  return value;
}
