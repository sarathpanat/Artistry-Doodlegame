export const keralaDict = {
  "Malayalam Movies": [
    "Drishyam",
    "Lucifer",
    "Premam",
    "Bangalore Days",
    "Spadikam",
    "Kireedam",
    "Chotta Mumbai",
    "Hridayam",
    "Kumbalangi Nights",
    "Maheshinte Prathikaram",
    "Thondimuthalum Driksakshiyum",
    "Angamaly Diaries",
    "Ustad Hotel",
    "Charlie",
    "Action Hero Biju",
    "Oru Vadakkan Selfie",
    "North 24 Kaatham",
    "Classmates",
    "Amar Akbar Anthony",
    "Nayakan"
  ],
  "Objects": [
    "Apple",
    "Banana",
    "Car",
    "House",
    "Tree",
    "Sun",
    "Moon",
    "Star",
    "Cloud",
    "Rainbow",
    "Book",
    "Pen",
    "Pencil",
    "Chair",
    "Table",
    "Phone",
    "Computer",
    "Camera",
    "Ball",
    "Bicycle"
  ]
  // Kerala Dishes, Kerala Places, and Malayalam Actors categories are commented out
};

export type CategoryKey = keyof typeof keralaDict;
export const categories = Object.keys(keralaDict) as CategoryKey[];
