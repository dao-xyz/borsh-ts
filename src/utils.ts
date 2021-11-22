
/**
 * Class with constructor
 */
export type Constructor<T> = new(...args: any[]) => T;

export const extendsClass = (clazz: any, otherClazz: any): boolean => {
    if(clazz instanceof Function){
      let baseClass = clazz;
      while (baseClass){
        const newBaseClass = Object.getPrototypeOf(baseClass);
        if(otherClazz == newBaseClass)
        {
            return true;
        }
        if(newBaseClass && newBaseClass !== Object && newBaseClass.name){
          baseClass = newBaseClass;
        } else {
            return false;
        }
      }
    }
    return false;
}
