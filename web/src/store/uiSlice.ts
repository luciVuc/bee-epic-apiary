import { createSlice, PayloadAction } from "@reduxjs/toolkit";

interface IUIState {
  isCartOpen: boolean;
  activeSectionId: string;
  isLoading: boolean;
}

const initialState: IUIState = {
  isCartOpen: false,
  activeSectionId: "home",
  isLoading: false,
};

const uiSlice = createSlice({
  name: "ui",
  initialState,
  reducers: {
    openCart: (state) => {
      state.isCartOpen = true;
    },
    closeCart: (state) => {
      state.isCartOpen = false;
    },
    toggleCart: (state) => {
      state.isCartOpen = !state.isCartOpen;
    },
    setActiveSection: (state, action: PayloadAction<string>) => {
      state.activeSectionId = action.payload;
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
    },
  },
});

export const { openCart, closeCart, toggleCart, setActiveSection, setLoading } =
  uiSlice.actions;
export default uiSlice.reducer;
